-- Tests for proposals to edit a published song (migration 20260923120000), pgTAP.
-- Run against a LOCAL Supabase (never production):
--   npx supabase start
--   npx supabase test db
-- Everything runs inside a transaction that is rolled back at the end.
--
-- Concurrency is exercised here in order, inside one session (pgTAP can't
-- open a second one): two proposals on the same base, approved one after the
-- other. What makes the real concurrent case safe is the song row lock
-- (FOR UPDATE in approve_submission): the second approval waits for the
-- first to commit and then finds a newer current_version, exactly as here.

begin;
create extension if not exists pgtap with schema extensions;

select plan(54);

-- --- Fixtures (as the table owner) ------------------------------------------------

-- A published song at version 1, with its version 1 snapshot.
insert into public.songs (id, title, content, categories, tags, chords_used)
values ('prueba-edicion', 'Prueba edición', E'[Verso 1]\n[G]Hola mundo', '{}', '{}', '{G}');
insert into public.song_versions (song_id, version, snapshot)
select s.id, 1, to_jsonb(s) from public.songs s where s.id = 'prueba-edicion';

-- A song that is published now and hidden later (test 8).
insert into public.songs (id, title, content) values ('prueba-a-ocultar', 'Prueba a ocultar', E'[Verso 1]\n[G]Hola');
insert into public.song_versions (song_id, version, snapshot)
select s.id, 1, to_jsonb(s) from public.songs s where s.id = 'prueba-a-ocultar';

-- A hidden song.
insert into public.songs (id, title, content, status) values ('prueba-oculta-ed', 'Prueba oculta', E'[Verso 1]\n[G]Hola', 'hidden');

-- A reviewer, and a signed-in user without a role.
insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'revisor-ed@example.com'),
       ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sin-rol-ed@example.com');
insert into public.editorial_roles (user_id, role) values ('00000000-0000-0000-0000-00000000e001', 'reviewer');

-- Two edits made on version 1 (A and B), and an old edit without base_version (L),
-- stored as the owner with known tracking codes and edit tokens.
insert into public.song_submissions (type, target_song_id, proposed_song, tracking_code, edit_token_hash, base_version, contributor_email)
values
  ('update', 'prueba-edicion',
   jsonb_build_object('schemaVersion', 1, 'title', 'Prueba edición', 'content', E'[Verso 1]\n[G]Hola [D]mundo',
                      'categories', '[]'::jsonb, 'tags', '[]'::jsonb, 'chordsUsed', '["G","D"]'::jsonb),
   'GS-EDAA-2222', encode(extensions.digest(repeat('a1', 32), 'sha256'), 'hex'), 1, 'a@example.com'),
  ('update', 'prueba-edicion',
   jsonb_build_object('schemaVersion', 1, 'title', 'Prueba edición', 'content', E'[Verso 1]\n[G]Hola mundo\n\n[Coro]\n[C]Nuevo coro',
                      'categories', '[]'::jsonb, 'tags', '[]'::jsonb, 'chordsUsed', '["G","C"]'::jsonb),
   'GS-EDBB-2222', encode(extensions.digest(repeat('b2', 32), 'sha256'), 'hex'), 1, null),
  ('update', 'prueba-edicion',
   jsonb_build_object('schemaVersion', 1, 'title', 'Prueba edición', 'content', E'[Verso 1]\n[G]Hola mundo antiguo',
                      'categories', '[]'::jsonb, 'tags', '[]'::jsonb, 'chordsUsed', '["G"]'::jsonb),
   'GS-EDCC-2222', encode(extensions.digest(repeat('c3', 32), 'sha256'), 'hex'), null, null),
  ('update', 'prueba-a-ocultar',
   jsonb_build_object('schemaVersion', 1, 'title', 'Prueba a ocultar', 'content', E'[Verso 1]\n[G]Hola [C]ya',
                      'categories', '[]'::jsonb, 'tags', '[]'::jsonb, 'chordsUsed', '["G","C"]'::jsonb),
   'GS-EDDD-2222', encode(extensions.digest(repeat('d4', 32), 'sha256'), 'hex'), 1, null);

-- A valid edit payload on version 1 of prueba-edicion (varied per test below). Kept in a
-- session setting rather than a table: any role can read it after SET ROLE.
do $$ begin perform set_config('genesaret.test_payload', jsonb_build_object(
  'schemaVersion', 1, 'type', 'update', 'targetSongId', 'prueba-edicion', 'baseVersion', 1,
  'song', jsonb_build_object('schemaVersion', 1, 'title', 'Prueba edición', 'content', E'[Verso 1]\n[G]Hola [Em]mundo',
                             'categories', '[]'::jsonb, 'tags', '[]'::jsonb, 'chordsUsed', '["G","Em"]'::jsonb),
  'contributor', jsonb_build_object('name', null, 'email', null))::text, true); end $$;

-- === 1. Schema ===============================================================
select has_column('public', 'song_submissions', 'base_version', 'song_submissions tiene base_version');
select throws_ok(
  $$ insert into public.song_submissions (type, proposed_song, tracking_code, edit_token_hash, base_version)
     values ('create', '{"schemaVersion":1}', 'GS-EDEE-2222', repeat('e', 64), 3) $$,
  '23514', null, 'una canción nueva no puede tener base_version');

-- === 2. Permissions ===========================================================
select hasnt_function('public', 'resubmit_song_submission_verified', array['text', 'text', 'jsonb', 'text'],
  'la versión antigua de resubmit (4 argumentos) ya no existe');
select has_function('public', 'resubmit_song_submission_verified', array['text', 'text', 'jsonb', 'text', 'integer'],
  'resubmit tiene la firma con p_base_version');
select ok(not has_function_privilege('anon', 'public.resubmit_song_submission_verified(text,text,jsonb,text,integer)', 'execute')
       and not has_function_privilege('authenticated', 'public.resubmit_song_submission_verified(text,text,jsonb,text,integer)', 'execute')
       and has_function_privilege('service_role', 'public.resubmit_song_submission_verified(text,text,jsonb,text,integer)', 'execute'),
  'resubmit: solo service_role');
select ok(not has_function_privilege('anon', 'public.submit_song_submission_verified(jsonb,text)', 'execute')
       and not has_function_privilege('authenticated', 'public.submit_song_submission_verified(jsonb,text)', 'execute')
       and has_function_privilege('service_role', 'public.submit_song_submission_verified(jsonb,text)', 'execute'),
  'submit verificado: solo service_role');
select ok(has_function_privilege('anon', 'public.get_submission_for_edit(text,text)', 'execute')
       and has_function_privilege('authenticated', 'public.get_submission_for_edit(text,text)', 'execute'),
  'get_submission_for_edit: anon y authenticated, tras recrearla');
select ok(not has_function_privilege('anon', 'public.approve_submission(uuid,text,text)', 'execute')
       and has_function_privilege('authenticated', 'public.approve_submission(uuid,text,text)', 'execute'),
  'approve_submission: authenticated (con rol comprobado dentro), nunca anon');
select ok(not has_function_privilege('anon', 'public.song_differs_from_published(jsonb,public.songs)', 'execute')
       and not has_function_privilege('authenticated', 'public.song_differs_from_published(jsonb,public.songs)', 'execute')
       and not has_function_privilege('anon', 'public.base_version_of(jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'public.base_version_of(jsonb)', 'execute'),
  'las funciones auxiliares no se pueden llamar desde la API');

-- A signed-in user without a role can't approve an edit.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated"}';
select throws_ok(
  $$ select * from public.approve_submission((select id from public.song_submissions where tracking_code = 'GS-EDAA-2222')) $$,
  '42501', null, 'un usuario sin rol no aprueba una edición');
reset role;

-- === 3. Sending an edit (as the Edge Function: service_role) ==================
set local role service_role;

select lives_ok(
  $$ select * from public.submit_song_submission_verified(current_setting('genesaret.test_payload')::jsonb, '198.51.100.11') $$,
  'edición válida sobre la versión actual: se guarda');
reset role;
select is(
  (select base_version from public.song_submissions
   where target_song_id = 'prueba-edicion' and proposed_song ->> 'content' = E'[Verso 1]\n[G]Hola [Em]mundo'),
  1, 'la edición guarda base_version = 1');
set local role service_role;

-- baseVersion invalid: missing, zero, negative, decimal, text, null.
select throws_ok($$ select * from public.submit_song_submission_verified((current_setting('genesaret.test_payload')::jsonb - 'baseVersion'), '198.51.100.12') $$,
  'P0001', 'GENESARET:invalid:base_version', 'sin baseVersion: rechazada');
select throws_ok($$ select * from public.submit_song_submission_verified((jsonb_set(current_setting('genesaret.test_payload')::jsonb, '{baseVersion}', '0')), '198.51.100.13') $$,
  'P0001', 'GENESARET:invalid:base_version', 'baseVersion 0: rechazada');
select throws_ok($$ select * from public.submit_song_submission_verified((jsonb_set(current_setting('genesaret.test_payload')::jsonb, '{baseVersion}', '-1')), '198.51.100.14') $$,
  'P0001', 'GENESARET:invalid:base_version', 'baseVersion negativa: rechazada');
select throws_ok($$ select * from public.submit_song_submission_verified((jsonb_set(current_setting('genesaret.test_payload')::jsonb, '{baseVersion}', '1.5')), '198.51.100.15') $$,
  'P0001', 'GENESARET:invalid:base_version', 'baseVersion decimal: rechazada');
select throws_ok($$ select * from public.submit_song_submission_verified((jsonb_set(current_setting('genesaret.test_payload')::jsonb, '{baseVersion}', '"1"')), '198.51.100.16') $$,
  'P0001', 'GENESARET:invalid:base_version', 'baseVersion como texto: rechazada');
select throws_ok($$ select * from public.submit_song_submission_verified((jsonb_set(current_setting('genesaret.test_payload')::jsonb, '{baseVersion}', 'null')), '198.51.100.17') $$,
  'P0001', 'GENESARET:invalid:base_version', 'baseVersion null: rechazada');
-- A well-formed but different version: stale.
select throws_ok($$ select * from public.submit_song_submission_verified((jsonb_set(current_setting('genesaret.test_payload')::jsonb, '{baseVersion}', '7')), '198.51.100.18') $$,
  'P0001', 'GENESARET:stale', 'baseVersion distinta de la actual: stale');

-- Nothing changes: refused.
select throws_ok(
  $$ select * from public.submit_song_submission_verified(
       (jsonb_set(current_setting('genesaret.test_payload')::jsonb, '{song,content}', to_jsonb(E'[Verso 1]\n[G]Hola mundo'::text))), '198.51.100.19') $$,
  'P0001', 'GENESARET:invalid:no_changes', 'una edición sin cambios: rechazada');

-- Hidden, or missing, target: refused.
select throws_ok(
  $$ select * from public.submit_song_submission_verified((jsonb_set(current_setting('genesaret.test_payload')::jsonb, '{targetSongId}', '"prueba-oculta-ed"')), '198.51.100.20') $$,
  'P0001', 'GENESARET:invalid:target', 'edición de una canción oculta: rechazada');
select throws_ok(
  $$ select * from public.submit_song_submission_verified((jsonb_set(current_setting('genesaret.test_payload')::jsonb, '{targetSongId}', '"no-existe"')), '198.51.100.21') $$,
  'P0001', 'GENESARET:invalid:target', 'edición de una canción que no existe: rechazada');

-- A new song must not carry a baseVersion; without it, it is sent as before.
select throws_ok(
  $$ select * from public.submit_song_submission_verified(
       (jsonb_set(current_setting('genesaret.test_payload')::jsonb, '{type}', '"create"') - 'targetSongId'), '198.51.100.22') $$,
  'P0001', 'GENESARET:invalid:base_version', 'una canción nueva con baseVersion: rechazada');
select lives_ok(
  $$ select * from public.submit_song_submission_verified(
       (jsonb_set(current_setting('genesaret.test_payload')::jsonb, '{type}', '"create"') - 'targetSongId' - 'baseVersion'), '198.51.100.23') $$,
  'una canción nueva sin baseVersion: se guarda como siempre');
reset role;

-- === 4. Approving: valid edit, then a second one on the same (now old) base ======
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}';

select results_eq(
  $$ select song_id, version from public.approve_submission((select id from public.song_submissions where tracking_code = 'GS-EDAA-2222')) $$,
  $$ values ('prueba-edicion'::text, 2) $$,
  'aprobar la edición A (base 1 = actual 1): se publica la versión 2 de la misma canción');
reset role;
select is((select current_version from public.songs where id = 'prueba-edicion'), 2, 'la canción está en la versión 2');
select is((select content from public.songs where id = 'prueba-edicion'), E'[Verso 1]\n[G]Hola [D]mundo', 'con el contenido de A');
select is((select count(*)::int from public.song_versions where song_id = 'prueba-edicion'), 2, 'hay exactamente dos versiones');
select is((select snapshot ->> 'content' from public.song_versions where song_id = 'prueba-edicion' and version = 1),
  E'[Verso 1]\n[G]Hola mundo', 'la versión 1 del historial sigue intacta');
select is((select snapshot ->> 'content' from public.song_versions where song_id = 'prueba-edicion' and version = 2),
  E'[Verso 1]\n[G]Hola [D]mundo', 'la versión 2 guarda exactamente lo publicado');
select is((select status || '/' || published_version from public.song_submissions where tracking_code = 'GS-EDAA-2222'),
  'approved/2', 'la propuesta A queda aprobada como versión 2');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}';
select throws_ok(
  $$ select * from public.approve_submission((select id from public.song_submissions where tracking_code = 'GS-EDBB-2222')) $$,
  'P0001', 'GENESARET:stale', 'aprobar B (base 1, actual 2): stale, nunca sobrescribe');
select throws_ok(
  $$ select * from public.approve_submission((select id from public.song_submissions where tracking_code = 'GS-EDAA-2222')) $$,
  'P0001', 'GENESARET:not_reviewable', 'aprobar A otra vez: no revisable');
reset role;
select is((select current_version || '/' || content from public.songs where id = 'prueba-edicion'),
  E'2/[Verso 1]\n[G]Hola [D]mundo', 'tras el intento con B la canción sigue en la versión 2, sin cambios');
select is((select count(*)::int from public.song_versions where song_id = 'prueba-edicion'), 2, 'y no se creó ninguna versión');
select is((select status from public.song_submissions where tracking_code = 'GS-EDBB-2222'), 'pending', 'B sigue pendiente');

-- === 5. Rebase of B =============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}';
select lives_ok(
  $$ select public.request_submission_changes((select id from public.song_submissions where tracking_code = 'GS-EDBB-2222'),
       'La canción se actualizó. Revisa tus cambios sobre la versión actual.') $$,
  'se piden cambios a B');
reset role;

-- The contributor reads it back: the proposal, its base and the snapshot of that base.
set local role anon;
select results_eq(
  $$ select target_song_id, base_version, base_snapshot ->> 'content' from public.get_submission_for_edit('gs-edbb-2222', repeat('b2', 32)) $$,
  $$ values ('prueba-edicion'::text, 1, E'[Verso 1]\n[G]Hola mundo'::text) $$,
  'get_submission_for_edit devuelve destino, versión base y su instantánea');
select is((select count(*)::int from public.get_submission_for_edit('GS-EDBB-2222', repeat('ff', 32))), 0,
  'con otro token no devuelve nada');
reset role;

set local role service_role;
select throws_ok(
  $$ select * from public.resubmit_song_submission_verified('GS-EDBB-2222', repeat('b2', 32),
       jsonb_build_object('schemaVersion', 1, 'title', 'Prueba edición', 'content', E'[Verso 1]\n[G]Hola [D]mundo\n\n[Coro]\n[C]Nuevo coro',
                          'categories', '[]'::jsonb, 'tags', '[]'::jsonb), '198.51.100.31', 1) $$,
  'P0001', 'GENESARET:stale', 'reenviar B con la base antigua (1): stale');
select throws_ok(
  $$ select * from public.resubmit_song_submission_verified('GS-EDBB-2222', repeat('b2', 32),
       jsonb_build_object('schemaVersion', 1, 'title', 'Prueba edición', 'content', E'[Verso 1]\n[G]Hola [D]mundo\n\n[Coro]\n[C]Nuevo coro',
                          'categories', '[]'::jsonb, 'tags', '[]'::jsonb), '198.51.100.32') $$,
  'P0001', 'GENESARET:invalid:base_version', 'reenviar una edición sin base: rechazado');
select throws_ok(
  $$ select * from public.resubmit_song_submission_verified('GS-EDBB-2222', repeat('b2', 32),
       jsonb_build_object('schemaVersion', 1, 'title', 'Prueba edición', 'content', E'[Verso 1]\n[G]Hola [D]mundo',
                          'categories', '[]'::jsonb, 'tags', '[]'::jsonb), '198.51.100.33', 2) $$,
  'P0001', 'GENESARET:invalid:no_changes', 'reenviar B idéntica a la versión actual: rechazado');
select lives_ok(
  $$ select * from public.resubmit_song_submission_verified('GS-EDBB-2222', repeat('b2', 32),
       jsonb_build_object('schemaVersion', 1, 'title', 'Prueba edición', 'content', E'[Verso 1]\n[G]Hola [D]mundo\n\n[Coro]\n[C]Nuevo coro',
                          'categories', '[]'::jsonb, 'tags', '[]'::jsonb, 'chordsUsed', '["G","D","C"]'::jsonb), '198.51.100.34', 2) $$,
  'rebase: reenviar B sobre la versión actual (2)');
reset role;
select is((select status || '/' || base_version from public.song_submissions where tracking_code = 'GS-EDBB-2222'),
  'pending/2', 'B vuelve a pendiente con base_version = 2');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}';
select results_eq(
  $$ select song_id, version from public.approve_submission((select id from public.song_submissions where tracking_code = 'GS-EDBB-2222')) $$,
  $$ values ('prueba-edicion'::text, 3) $$,
  'B, ya actualizada, se aprueba como versión 3');
reset role;
select is((select count(*)::int from public.song_versions where song_id = 'prueba-edicion'), 3, 'historial: versiones 1, 2 y 3');

-- === 6. An old edit without base_version ========================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}';
select throws_ok(
  $$ select * from public.approve_submission((select id from public.song_submissions where tracking_code = 'GS-EDCC-2222')) $$,
  'P0001', 'GENESARET:stale', 'una edición antigua sin base_version no se aprueba: stale');
-- Its way out is the same rebase: changes requested, resent on the current version.
select lives_ok(
  $$ select public.request_submission_changes((select id from public.song_submissions where tracking_code = 'GS-EDCC-2222'),
       'Actualízala sobre la versión actual.') $$,
  'se piden cambios a la edición antigua');
reset role;
set local role service_role;
select lives_ok(
  $$ select * from public.resubmit_song_submission_verified('GS-EDCC-2222', repeat('c3', 32),
       jsonb_build_object('schemaVersion', 1, 'title', 'Prueba edición', 'content', E'[Verso 1]\n[G]Hola [D]mundo antiguo\n\n[Coro]\n[C]Nuevo coro',
                          'categories', '[]'::jsonb, 'tags', '[]'::jsonb, 'chordsUsed', '["G","D","C"]'::jsonb), '198.51.100.41', 3) $$,
  'la edición antigua se actualiza sobre la versión 3');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}';
select results_eq(
  $$ select song_id, version from public.approve_submission((select id from public.song_submissions where tracking_code = 'GS-EDCC-2222')) $$,
  $$ values ('prueba-edicion'::text, 4) $$,
  'ya actualizada, se aprueba como versión 4');
reset role;

-- === 7. The song is hidden after the proposal was made ============================
update public.songs set status = 'hidden' where id = 'prueba-a-ocultar';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}';
select throws_ok(
  $$ select * from public.approve_submission((select id from public.song_submissions where tracking_code = 'GS-EDDD-2222')) $$,
  'P0001', 'GENESARET:invalid:target', 'aprobar la edición de una canción ya oculta: rechazado');
reset role;
select is((select current_version || '/' || status from public.songs where id = 'prueba-a-ocultar'), '1/hidden',
  'la canción oculta no cambia');
select is((select count(*)::int from public.song_versions where song_id = 'prueba-a-ocultar'), 1, 'ni gana versiones');

-- === 8. History stays immutable ==================================================
select throws_ok(
  $$ update public.song_versions set snapshot = '{}' where song_id = 'prueba-edicion' and version = 1 $$,
  'P0001', null, 'una versión publicada no se puede modificar');

select * from finish();
rollback;
