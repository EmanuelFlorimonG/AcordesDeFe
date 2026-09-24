-- Security tests for each account's setlists (pgTAP).
-- Run against a LOCAL Supabase (never production):
--   npx supabase start
--   npx supabase test db
-- Everything runs inside a transaction that is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(42);

-- --- Fixtures (as the table owner) -------------------------------------------
-- Two ordinary accounts. Neither has an editorial role, on purpose: setlists
-- are for everybody with an account, and editorial_roles is only for reviewing
-- the catalog.
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@example.com'),
  ('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bruno@example.com');

-- Bruno already has one, written as the owner so Ana's own inserts are the
-- ones being tested later.
insert into public.setlists (owner_id, id, name, items, client_created_at, client_updated_at)
values ('00000000-0000-0000-0000-0000000005b1', 'setlist-de-bruno', 'Misa de Bruno', '[]'::jsonb, now(), now());

-- --- A. Anonymous visitor ------------------------------------------------------
set local role anon;

select throws_ok(
  $$ select * from public.setlists $$,
  '42501', null, 'anon no puede leer setlists'
);
select throws_ok(
  $$ insert into public.setlists (owner_id, id, name, client_created_at, client_updated_at)
     values ('00000000-0000-0000-0000-0000000005a1', 'setlist-intruso', 'Intruso', now(), now()) $$,
  '42501', null, 'anon no puede crear setlists'
);
select throws_ok(
  $$ update public.setlists set name = 'Robado' $$,
  '42501', null, 'anon no puede modificar setlists'
);
select throws_ok(
  $$ delete from public.setlists $$,
  '42501', null, 'anon no puede borrar setlists'
);

-- Ni siquiera diciendo ser otra persona: el permiso no depende del jwt.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005b1","role":"authenticated"}';
select throws_ok(
  $$ select * from public.setlists $$,
  '42501', null, 'anon con un sub ajeno en el jwt tampoco lee nada'
);

reset role;
reset request.jwt.claims;

-- --- B. Ana, con su propia sesión ----------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005a1","role":"authenticated"}';

-- Sin owner_id: lo pone el valor por defecto, que es quien está autenticado.
select lives_ok(
  $$ insert into public.setlists (id, name, date, description, items, client_created_at, client_updated_at)
     values ('setlist-123', 'Misa Domingo', '2026-10-04', 'Primera prueba',
             '[{"id":"item-1","songId":"huracan-hakuna","moment":"Entrada","transposeSteps":0,"capoFret":0,"notes":""}]'::jsonb,
             now(), now()) $$,
  'Ana crea un setlist suyo'
);
select is(
  (select owner_id from public.setlists where id = 'setlist-123'),
  '00000000-0000-0000-0000-0000000005a1'::uuid,
  'y queda a su nombre sin que ella lo diga'
);
select results_eq(
  $$ select name from public.setlists order by name $$,
  array['Misa Domingo'],
  'Ana lee lo suyo, y sólo lo suyo'
);
select lives_ok(
  $$ update public.setlists set name = 'Misa del domingo', revision = revision + 1 where id = 'setlist-123' $$,
  'Ana modifica lo suyo'
);
select is(
  (select name || ' v' || revision from public.setlists where id = 'setlist-123'),
  'Misa del domingo v2',
  'y queda cambiado, con su revisión avanzada'
);

-- --- C. Lo de Bruno no existe para Ana -----------------------------------------
select is(
  (select count(*)::int from public.setlists where id = 'setlist-de-bruno'),
  0,
  'Ana no ve el setlist de Bruno aunque conozca su id'
);
-- Ninguna de las dos falla: sencillamente no alcanzan nada. Que la fila de
-- Bruno sigue intacta se comprueba al final, ya como dueño de la tabla.
select lives_ok(
  $$ update public.setlists set name = 'Robado' where id = 'setlist-de-bruno' $$,
  'un PATCH por id, sin owner_id, no alcanza la fila de Bruno'
);
select lives_ok(
  $$ delete from public.setlists where id = 'setlist-de-bruno' $$,
  'un DELETE por id, sin owner_id, tampoco'
);

-- TRUNCATE no pasa por Row Level Security: nadie con una cuenta lo tiene.
select throws_ok(
  $$ truncate public.setlists $$,
  '42501', null, 'nadie puede vaciar la tabla entera'
);

-- --- D. El dueño no se pone a mano ---------------------------------------------
select throws_ok(
  $$ insert into public.setlists (owner_id, id, name, client_created_at, client_updated_at)
     values ('00000000-0000-0000-0000-0000000005b1', 'regalado', 'Para Bruno', now(), now()) $$,
  '42501', null, 'Ana no puede crear un setlist a nombre de Bruno'
);
select throws_ok(
  $$ update public.setlists set owner_id = '00000000-0000-0000-0000-0000000005b1' where id = 'setlist-123' $$,
  '42501', null, 'ni regalarle uno suyo cambiando el dueño'
);

-- --- F. Lo que la tabla no admite ----------------------------------------------
select throws_ok(
  $$ insert into public.setlists (id, name, client_created_at, client_updated_at)
     values ('corto', 'Nombre', now(), now()) $$,
  '23514', null, 'un id demasiado corto no entra'
);
select throws_ok(
  $$ insert into public.setlists (id, name, client_created_at, client_updated_at)
     values ('con espacio en medio', 'Nombre', now(), now()) $$,
  '23514', null, 'ni un id con espacios'
);
select throws_ok(
  $$ insert into public.setlists (id, name, client_created_at, client_updated_at)
     values ('setlist-vacio', '   ', now(), now()) $$,
  '23514', null, 'un nombre en blanco no es un nombre'
);
select throws_ok(
  $$ insert into public.setlists (id, name, client_created_at, client_updated_at)
     values ('setlist-largo', repeat('N', 81), now(), now()) $$,
  '23514', null, 'ni uno de más de ochenta caracteres'
);
select throws_ok(
  $$ insert into public.setlists (id, name, date, client_created_at, client_updated_at)
     values ('setlist-fecha', 'Nombre', '04/10/2026', now(), now()) $$,
  '23514', null, 'la fecha se escribe como la escribe la aplicación'
);
select throws_ok(
  $$ insert into public.setlists (id, name, description, client_created_at, client_updated_at)
     values ('setlist-desc', 'Nombre', repeat('D', 501), now(), now()) $$,
  '23514', null, 'una descripción tiene un límite'
);
select throws_ok(
  $$ insert into public.setlists (id, name, items, client_created_at, client_updated_at)
     values ('setlist-items', 'Nombre', '{"no":"es una lista"}'::jsonb, now(), now()) $$,
  '23514', null, 'las entradas son una lista, no otra cosa'
);
-- El tamaño: un setlist de verdad cabe de sobra, y uno desmedido no entra.
select lives_ok(
  $$ insert into public.setlists (id, name, items, client_created_at, client_updated_at)
     values ('setlist-normal', 'Cincuenta canciones',
             (select jsonb_agg(jsonb_build_object(
                'id', 'item-' || n, 'songId', 'huracan-hakuna', 'moment', 'Entrada',
                'transposeSteps', 0, 'capoFret', 0, 'notes', repeat('nota ', 40)))
              from generate_series(1, 50) as n),
             now(), now()) $$,
  'un setlist largo de verdad entra sin problema'
);
select cmp_ok(
  (select octet_length(items::text) from public.setlists where id = 'setlist-normal'),
  '<', 200000,
  'y pesa bastante menos del límite'
);
select throws_ok(
  $$ insert into public.setlists (id, name, items, client_created_at, client_updated_at)
     values ('setlist-enorme', 'Desmedido',
             (select jsonb_agg(jsonb_build_object('id', 'item-' || n, 'notes', repeat('x', 30000)))
              from generate_series(1, 10) as n),
             now(), now()) $$,
  '23514', null, 'un payload de cientos de miles de bytes no entra, aunque sean diez entradas'
);
select throws_ok(
  $$ insert into public.setlists (id, name, items, client_created_at, client_updated_at)
     values ('setlist-muchos', 'Nombre',
             (select jsonb_agg(jsonb_build_object('id', n::text)) from generate_series(1, 201) as n),
             now(), now()) $$,
  '23514', null, 'doscientas entradas son muchas; doscientas una, demasiadas'
);
select throws_ok(
  $$ insert into public.setlists (id, name, payload_version, client_created_at, client_updated_at)
     values ('setlist-version', 'Nombre', 0, now(), now()) $$,
  '23514', null, 'no hay una versión cero del formato'
);
select throws_ok(
  $$ insert into public.setlists (id, name, revision, client_created_at, client_updated_at)
     values ('setlist-revision', 'Nombre', 0, now(), now()) $$,
  '23514', null, 'ni una revisión cero'
);

-- --- G. Los relojes del servidor ------------------------------------------------
select is(
  (select updated_at > client_updated_at - interval '1 minute' from public.setlists where id = 'setlist-123'),
  true,
  'updated_at lo pone el servidor'
);

-- --- I. Borrado suave ------------------------------------------------------------
select lives_ok(
  $$ update public.setlists set deleted_at = now() where id = 'setlist-123' $$,
  'un setlist se marca como borrado sin desaparecer'
);
select is(
  (select count(*)::int from public.setlists where id = 'setlist-123' and deleted_at is not null),
  1,
  'la fila sigue ahí, con su lápida, para que el borrado llegue a los demás dispositivos'
);

-- --- B (cierre). Borrar de verdad lo suyo ---------------------------------------
select lives_ok(
  $$ delete from public.setlists where id = 'setlist-123' $$,
  'Ana borra lo suyo cuando quiere'
);
select is(
  (select count(*)::int from public.setlists where id = 'setlist-123'), 0,
  'y desaparece de verdad'
);

-- --- E. El mismo id en dos cuentas -----------------------------------------------
select lives_ok(
  $$ insert into public.setlists (id, name, client_created_at, client_updated_at)
     values ('setlist-compartido', 'El de Ana', now(), now()) $$,
  'Ana usa un id'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005b1","role":"authenticated"}';

select lives_ok(
  $$ insert into public.setlists (id, name, client_created_at, client_updated_at)
     values ('setlist-compartido', 'El de Bruno', now(), now()) $$,
  'y Bruno puede usar exactamente el mismo'
);
select results_eq(
  $$ select name from public.setlists where id = 'setlist-compartido' $$,
  array['El de Bruno'],
  'cada uno ve el suyo'
);
select is(
  (select count(*)::int from public.setlists where id = 'setlist-de-bruno'),
  1,
  'y Bruno sigue teniendo el suyo intacto después de todo'
);

reset role;
reset request.jwt.claims;

select is(
  (select name from public.setlists where id = 'setlist-de-bruno'),
  'Misa de Bruno',
  'después de los intentos de Ana, la fila de Bruno sigue intacta'
);

-- --- Sin rol editorial, y sin embargo con sus setlists ---------------------------
select is(
  (select count(*)::int from public.editorial_roles
    where user_id in ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000005b1')),
  0,
  'ninguna de las dos cuentas es del equipo editorial, y aun así tienen sus setlists'
);

-- --- H. Se va la cuenta, se van sus setlists -------------------------------------
delete from auth.users where id = '00000000-0000-0000-0000-0000000005b1';
select is(
  (select count(*)::int from public.setlists where owner_id = '00000000-0000-0000-0000-0000000005b1'),
  0,
  'borrar la cuenta se lleva sus setlists'
);
select is(
  (select count(*)::int from public.setlists where owner_id = '00000000-0000-0000-0000-0000000005a1'),
  2,
  'y no toca los de nadie más'
);

select * from finish();
rollback;
