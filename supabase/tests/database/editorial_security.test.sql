-- Security tests for the editorial catalog (pgTAP).
-- Run against a LOCAL Supabase (never production):
--   npx supabase start
--   npx supabase test db
-- Everything runs inside a transaction that is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

-- --- Fixtures (as the table owner) -------------------------------------------
insert into public.songs (id, title, content) values
  ('prueba-publicada', 'Prueba publicada', '[G]Letra'),
  ('prueba-oculta', 'Prueba oculta', '[G]Letra');
update public.songs set status = 'hidden' where id = 'prueba-oculta';

insert into public.song_submissions (type, proposed_song, contributor_email, tracking_code, edit_token_hash)
values ('create', '{"schemaVersion":1,"title":"Existente","content":"[G]Hola"}', 'persona@example.com',
        'GS-2345-6789', repeat('a', 64));

-- A reviewer, for the approval test at the end.
insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'revisor@example.com');
insert into public.editorial_roles (user_id, role) values ('00000000-0000-0000-0000-00000000a001', 'reviewer');

-- --- Anonymous visitor ---------------------------------------------------------
set local role anon;

select results_eq(
  $$ select id from public.songs where id like 'prueba-%' order by id $$,
  array['prueba-publicada'],
  'anon lee solo canciones publicadas'
);
select throws_ok(
  $$ insert into public.songs (id, title, content) values ('intrusa', 'Intrusa', 'x') $$,
  '42501', null, 'anon no puede crear canciones'
);
select throws_ok(
  $$ update public.songs set title = 'Cambiada' where id = 'prueba-publicada' $$,
  '42501', null, 'anon no puede modificar canciones'
);
select throws_ok(
  $$ delete from public.songs where id = 'prueba-publicada' $$,
  '42501', null, 'anon no puede eliminar canciones'
);
select throws_ok(
  $$ select contributor_email from public.song_submissions $$,
  '42501', null, 'anon no puede leer las propuestas (ni sus correos)'
);
select throws_ok(
  $$ insert into public.song_submissions (type, proposed_song, tracking_code, edit_token_hash)
     values ('create', '{}', 'GS-2222-2222', repeat('b', 64)) $$,
  '42501', null, 'anon no puede insertar propuestas directamente'
);
select throws_ok(
  $$ select * from public.song_versions $$,
  '42501', null, 'anon no puede leer versiones'
);
select throws_ok(
  $$ select * from public.editorial_roles $$,
  '42501', null, 'anon no puede leer roles'
);
select throws_ok(
  $$ select * from public.approve_submission((select gen_random_uuid())) $$,
  '42501', null, 'anon no puede aprobar'
);
select throws_ok(
  $$ select public.reject_submission((select gen_random_uuid()), 'no') $$,
  '42501', null, 'anon no puede rechazar'
);

-- Proposals are sent only through the Edge Function (Turnstile first), never
-- straight from the browser (migration 20260920120000).
select throws_ok(
  $$ select * from public.submit_song_submission(
       '{"schemaVersion":1,"type":"create","targetSongId":null,
         "song":{"schemaVersion":1,"title":"Nueva","content":"[G]Hola"}}'::jsonb) $$,
  '42501', null, 'anon ya no puede enviar directamente a la base de datos'
);
select throws_ok(
  $$ select * from public.submit_song_submission_verified('{}'::jsonb, '198.51.100.1') $$,
  '42501', null, 'anon no puede llamar a la función que usa la Edge Function'
);

-- The status check returns safe fields only.
select results_eq(
  $$ select title, status from public.get_submission_status('gs-2345-6789') $$,
  $$ values ('Existente'::text, 'pending'::text) $$,
  'el seguimiento devuelve título y estado'
);
select is(
  (select to_jsonb(s) ?| array['contributor_email', 'contributor_name', 'edit_token_hash', 'proposed_song', 'id']
   from public.get_submission_status('GS-2345-6789') s),
  false,
  'el seguimiento no expone correo, nombre, token, contenido ni id interno'
);
select is(
  (select count(*)::int from public.get_submission_status('GS-ZZZZ-ZZZZ')),
  0,
  'un código inexistente no devuelve nada'
);

-- --- The Edge Function (service_role), after Turnstile passed ---------------------
reset role;
set local role service_role;

select lives_ok(
  $$ select * from public.submit_song_submission_verified(
       '{"schemaVersion":1,"type":"create","targetSongId":null,
         "song":{"schemaVersion":1,"title":"Nueva","content":"[G]Hola"},
         "contributor":{"name":"Ana","email":"ana@example.com"}}'::jsonb, '198.51.100.1') $$,
  'la Edge Function puede enviar una propuesta válida'
);
select throws_ok(
  $$ select * from public.submit_song_submission_verified('{"schemaVersion":1,"type":"create","song":{}}'::jsonb, '198.51.100.1') $$,
  'P0001', null, 'una propuesta inválida se rechaza'
);
select throws_ok(
  $$ select * from public.submit_song_submission_verified(
       '{"schemaVersion":1,"type":"update","targetSongId":"prueba-oculta",
         "song":{"schemaVersion":1,"title":"X","content":"[G]x"}}'::jsonb, '198.51.100.1') $$,
  'P0001', null, 'no se corrige una canción que no está publicada'
);

-- --- Signed-in user without a role ---------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b002","role":"authenticated"}';

select is((select count(*)::int from public.song_submissions), 0, 'un usuario sin rol no ve propuestas');
select throws_ok(
  $$ select * from public.submit_song_submission_verified('{}'::jsonb, '198.51.100.1') $$,
  '42501', null, 'un usuario con sesión tampoco puede saltarse la Edge Function'
);
select throws_ok(
  $$ select * from public.approve_submission((select id from public.song_submissions limit 1)) $$,
  '42501', null, 'un usuario sin rol no puede aprobar'
);

-- --- Reviewer: approval is atomic ------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';

select results_eq(
  $$ select song_id, version from public.approve_submission(
       (select id from public.song_submissions where tracking_code = 'GS-2345-6789')) $$,
  $$ values ('existente'::text, 1) $$,
  'aprobar publica la canción con su id y la versión 1'
);
select is(
  (select status from public.song_submissions where tracking_code = 'GS-2345-6789'),
  'approved',
  'la propuesta queda aprobada'
);
select is(
  (select count(*)::int from public.song_versions where song_id = 'existente'),
  1,
  'la publicación dejó su versión'
);
select throws_ok(
  $$ select * from public.approve_submission(
       (select id from public.song_submissions where tracking_code = 'GS-2345-6789')) $$,
  'P0001', null, 'una propuesta aprobada no se publica dos veces'
);

select * from finish();
rollback;
