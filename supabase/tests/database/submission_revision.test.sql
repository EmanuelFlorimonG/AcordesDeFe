-- Tests for editorial decisions bound to the revision the reviewer read
-- (migration 20260924120000), pgTAP. Run against a LOCAL Supabase (never
-- production):
--   npx supabase start
--   npx supabase test db
-- Everything runs inside a transaction that is rolled back at the end.
--
-- The race this covers: the panel reads a proposal, its author sends it again
-- with other words, and the reviewer decides on what they read. The decision
-- must be refused, not applied to the new content.

begin;
create extension if not exists pgtap with schema extensions;

select plan(38);

-- --- Fixtures (as the table owner) ------------------------------------------------

-- A published song at version 1, with its snapshot.
insert into public.songs (id, title, content, categories, tags, chords_used)
values ('prueba-revision', 'Prueba revisión', E'[Verso 1]\n[G]Hola mundo', '{}', '{}', '{G}');
insert into public.song_versions (song_id, version, snapshot)
select s.id, 1, to_jsonb(s) from public.songs s where s.id = 'prueba-revision';

-- A reviewer.
insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'revisor-rev@example.com');
insert into public.editorial_roles (user_id, role) values ('00000000-0000-0000-0000-00000000f001', 'reviewer');

-- Proposals: R (the one in the race), S (asked for changes), T (to reject),
-- and U and V, two edits made on the same version of the song.
insert into public.song_submissions (type, target_song_id, proposed_song, tracking_code, edit_token_hash, base_version, status)
values
  ('update', 'prueba-revision',
   jsonb_build_object('schemaVersion', 1, 'title', 'Prueba revisión', 'content', E'[Verso 1]\n[G]Hola [D]mundo',
                      'categories', '[]'::jsonb, 'tags', '[]'::jsonb, 'chordsUsed', '["G","D"]'::jsonb),
   'GS-RXAA-3333', encode(extensions.digest(repeat('a1', 32), 'sha256'), 'hex'), 1, 'changes_requested'),
  ('create', null,
   jsonb_build_object('schemaVersion', 1, 'title', 'Canción nueva revisión', 'content', E'[Verso 1]\n[G]Nueva',
                      'categories', '[]'::jsonb, 'tags', '[]'::jsonb, 'chordsUsed', '["G"]'::jsonb),
   'GS-RXBB-3333', encode(extensions.digest(repeat('b2', 32), 'sha256'), 'hex'), null, 'pending'),
  ('create', null,
   jsonb_build_object('schemaVersion', 1, 'title', 'Canción a rechazar', 'content', E'[Verso 1]\n[G]Otra',
                      'categories', '[]'::jsonb, 'tags', '[]'::jsonb, 'chordsUsed', '["G"]'::jsonb),
   'GS-RXCC-3333', encode(extensions.digest(repeat('c3', 32), 'sha256'), 'hex'), null, 'pending'),
  ('update', 'prueba-revision',
   jsonb_build_object('schemaVersion', 1, 'title', 'Prueba revisión', 'content', E'[Verso 1]\n[G]Hola [Em]mundo',
                      'categories', '[]'::jsonb, 'tags', '[]'::jsonb, 'chordsUsed', '["G","Em"]'::jsonb),
   'GS-RXDD-3333', encode(extensions.digest(repeat('d4', 32), 'sha256'), 'hex'), 1, 'pending'),
  ('update', 'prueba-revision',
   jsonb_build_object('schemaVersion', 1, 'title', 'Prueba revisión', 'content', E'[Verso 1]\n[G]Hola mundo\n\n[Coro]\n[C]Coro',
                      'categories', '[]'::jsonb, 'tags', '[]'::jsonb, 'chordsUsed', '["G","C"]'::jsonb),
   'GS-RXEE-3333', encode(extensions.digest(repeat('e5', 32), 'sha256'), 'hex'), 1, 'pending');

-- === 1. Schema and permissions ==============================================
select has_column('public', 'song_submissions', 'revision', 'song_submissions tiene revision');
select is(
  (select revision from public.song_submissions where tracking_code = 'GS-RXAA-3333'),
  1, 'una propuesta nace en la revisión 1');
select throws_ok(
  $$ update public.song_submissions set revision = 0 where tracking_code = 'GS-RXAA-3333' $$,
  '23514', null, 'la revisión no puede bajar de 1');

select hasnt_function('public', 'approve_submission', array['uuid', 'text', 'text'], 'la firma anterior de approve_submission ya no existe');
select hasnt_function('public', 'request_submission_changes', array['uuid', 'text'], 'la firma anterior de request_submission_changes ya no existe');
select hasnt_function('public', 'reject_submission', array['uuid', 'text'], 'la firma anterior de reject_submission ya no existe');
select has_function('public', 'approve_submission', array['uuid', 'text', 'text', 'integer'], 'approve_submission recibe la revisión esperada');
select has_function('public', 'request_submission_changes', array['uuid', 'text', 'integer'], 'request_submission_changes recibe la revisión esperada');
select has_function('public', 'reject_submission', array['uuid', 'text', 'integer'], 'reject_submission recibe la revisión esperada');
select function_privs_are('public', 'approve_submission', array['uuid', 'text', 'text', 'integer'], 'anon', '{}', 'anon no puede aprobar');
select function_privs_are('public', 'approve_submission', array['uuid', 'text', 'text', 'integer'], 'authenticated', '{EXECUTE}', 'los revisores aprueban con su sesión');
select function_privs_are('public', 'request_submission_changes', array['uuid', 'text', 'integer'], 'anon', '{}', 'anon no puede pedir cambios');
select function_privs_are('public', 'reject_submission', array['uuid', 'text', 'integer'], 'anon', '{}', 'anon no puede rechazar');

-- === 2. A: el colaborador reenvía mientras el revisor mira ===================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f001","role":"authenticated"}', true);

-- El revisor abre la propuesta y lee su revisión.
select is((select revision from public.song_submissions where tracking_code = 'GS-RXAA-3333'), 1, 'el revisor lee la revisión 1');

reset role;
-- El colaborador la reenvía corregida: sube a la revisión 2.
select lives_ok(
  $$ select public.resubmit_song_submission_verified('GS-RXAA-3333', repeat('a1', 32),
       jsonb_build_object('schemaVersion', 1, 'title', 'Prueba revisión', 'content', E'[Verso 1]\n[G]Hola [A]mundo distinto',
                          'categories', '[]'::jsonb, 'tags', '[]'::jsonb, 'chordsUsed', '["G","A"]'::jsonb),
       '198.51.100.21', 1) $$,
  'el colaborador reenvía su propuesta');
select is((select revision from public.song_submissions where tracking_code = 'GS-RXAA-3333'), 2, 'reenviar sube la revisión');
select is((select status from public.song_submissions where tracking_code = 'GS-RXAA-3333'), 'pending', 'y vuelve a revisión');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f001","role":"authenticated"}', true);

-- Aprobar con la revisión que el revisor leyó: rechazado, y nada se publica.
select throws_ok(
  $$ select public.approve_submission((select id from public.song_submissions where tracking_code = 'GS-RXAA-3333'), null, null, 1) $$,
  'P0001', 'GENESARET:submission_changed', 'aprobar con una revisión vieja se rechaza');
select is((select current_version from public.songs where id = 'prueba-revision'), 1, 'la canción no cambió');
select is((select count(*) from public.song_versions where song_id = 'prueba-revision'), 1::bigint, 'no se creó ninguna versión');
select is((select status from public.song_submissions where tracking_code = 'GS-RXAA-3333'), 'pending', 'la propuesta sigue pendiente');

-- Sin decir qué revisión se leyó, tampoco se decide.
select throws_ok(
  $$ select public.approve_submission((select id from public.song_submissions where tracking_code = 'GS-RXAA-3333'), null, null, null) $$,
  'P0001', 'GENESARET:invalid:revision', 'aprobar sin revisión esperada se rechaza');

-- === 3. B: con la revisión actual, la aprobación es la de siempre ============
select lives_ok(
  $$ select public.approve_submission((select id from public.song_submissions where tracking_code = 'GS-RXAA-3333'), null, null, 2) $$,
  'aprobar con la revisión actual publica');
select is((select current_version from public.songs where id = 'prueba-revision'), 2, 'la canción pasa a la versión 2');
select is((select content from public.songs where id = 'prueba-revision'), E'[Verso 1]\n[G]Hola [A]mundo distinto', 'se publicó lo último que envió el colaborador');
select is((select status from public.song_submissions where tracking_code = 'GS-RXAA-3333'), 'approved', 'la propuesta queda aprobada');

-- === 4. C: pedir cambios con una revisión vieja ==============================
reset role;
select lives_ok(
  $$ update public.song_submissions set revision = revision + 1 where tracking_code = 'GS-RXBB-3333' $$,
  'la propuesta nueva cambia mientras el revisor la lee');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.request_submission_changes((select id from public.song_submissions where tracking_code = 'GS-RXBB-3333'), 'Revisa el coro.', 1) $$,
  'P0001', 'GENESARET:submission_changed', 'pedir cambios con una revisión vieja se rechaza');
select is((select status from public.song_submissions where tracking_code = 'GS-RXBB-3333'), 'pending', 'no se escribió nada');
select lives_ok(
  $$ select public.request_submission_changes((select id from public.song_submissions where tracking_code = 'GS-RXBB-3333'), 'Revisa el coro.', 2) $$,
  'con la revisión actual sí se piden cambios');
select is((select status from public.song_submissions where tracking_code = 'GS-RXBB-3333'), 'changes_requested', 'la propuesta queda en cambios solicitados');

-- === 5. D: rechazar con una revisión vieja ===================================
reset role;
select lives_ok(
  $$ update public.song_submissions set revision = revision + 1 where tracking_code = 'GS-RXCC-3333' $$,
  'la propuesta a rechazar también cambia');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.reject_submission((select id from public.song_submissions where tracking_code = 'GS-RXCC-3333'), 'Duplicada', 1) $$,
  'P0001', 'GENESARET:submission_changed', 'rechazar con una revisión vieja se rechaza');
select is((select status from public.song_submissions where tracking_code = 'GS-RXCC-3333'), 'pending', 'la propuesta sigue pendiente');
select lives_ok(
  $$ select public.reject_submission((select id from public.song_submissions where tracking_code = 'GS-RXCC-3333'), 'Duplicada', 2) $$,
  'con la revisión actual sí se rechaza');

-- === 6. E: dos ediciones sobre la misma versión de la canción ================
-- La canción está en la versión 2 y U y V se hicieron sobre la 1: las dos
-- siguen bloqueadas por baseVersion, que protege la canción, no la propuesta.
select throws_ok(
  $$ select public.approve_submission((select id from public.song_submissions where tracking_code = 'GS-RXDD-3333'), null, null, 1) $$,
  'P0001', 'GENESARET:stale', 'una edición sobre una versión vieja sigue siendo stale');
select throws_ok(
  $$ select public.approve_submission((select id from public.song_submissions where tracking_code = 'GS-RXEE-3333'), null, null, 1) $$,
  'P0001', 'GENESARET:stale', 'y la segunda también');
select is((select current_version from public.songs where id = 'prueba-revision'), 2, 'la canción sigue en la versión 2');

select * from finish();
rollback;
