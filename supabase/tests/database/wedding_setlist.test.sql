-- Local Supabase only. All fixture changes are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, instance_id, aud, role, email) values
 ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wedding-test@example.com');

-- Las dos modalidades entran sin formato nuevo.
select lives_ok($$
  insert into public.setlists (owner_id, id, name, kind, client_created_at, client_updated_at)
  values
   ('00000000-0000-0000-0000-0000000009a1', 'wedding-test', 'Boda de María y José', 'boda', now(), now()),
   ('00000000-0000-0000-0000-0000000009a1', 'wedding-no-mass', 'Boda sin misa', 'boda-sin-misa', now(), now())
$$, 'Both wedding kinds are accepted');

select is((select kind from public.setlists where id = 'wedding-test'), 'boda', 'Kind survives storage');
select is((select moments from public.setlists where id = 'wedding-test'), null, 'A new wedding stores no sections of its own');

-- Las secciones propias: una lista, en orden, y el orden se conserva.
select lives_ok($$
  update public.setlists
     set moments = '["Entrada","Evangelio","Votos","Firmadera","Backup"]'::jsonb
   where id = 'wedding-test'
$$, 'Its own sections can be stored');

select is(
  (select moments->>0 from public.setlists where id = 'wedding-test'),
  'Entrada',
  'The stored order is the order that comes back'
);
select is(
  (select jsonb_array_length(moments) from public.setlists where id = 'wedding-test'),
  5,
  'Every section is kept'
);

-- Lo que no es una lista de secciones no entra.
select throws_ok($$
  update public.setlists set moments = '"Entrada"'::jsonb where id = 'wedding-test'
$$, '23514', null, 'A section list has to be a list');
select throws_ok($$
  update public.setlists set moments = '[]'::jsonb where id = 'wedding-test'
$$, '23514', null, 'An empty section list is rejected');
select throws_ok($$
  update public.setlists
     set moments = (select jsonb_agg('S' || n) from generate_series(1, 41) as n)
   where id = 'wedding-test'
$$, '23514', null, 'The section list has a ceiling');

-- Y lo de antes sigue como estaba.
select lives_ok($$
  insert into public.setlists (owner_id, id, name, kind, client_created_at, client_updated_at)
  values
   ('00000000-0000-0000-0000-0000000009a1', 'legacy-wedding-test', 'Old Mass', null, now(), now()),
   ('00000000-0000-0000-0000-0000000009a1', 'mass-wedding-test', 'Mass', 'misa', now(), now()),
   ('00000000-0000-0000-0000-0000000009a1', 'adoration-wedding-test', 'Adoration', 'adoracion', now(), now()),
   ('00000000-0000-0000-0000-0000000009a1', 'rosary-wedding-test', 'Rosary', 'rosario-aurora', now(), now())
$$, 'All earlier kinds remain accepted');

select is(
  (select count(*) from public.setlists where moments is not null and id <> 'wedding-test'),
  0::bigint,
  'Nothing else grew sections of its own'
);

-- La sección de reserva, cuando la renombran.
select is((select backup_moment from public.setlists where id = 'wedding-test'), null, 'By default the reserve is the one called Backup');
select lives_ok($$
  update public.setlists set backup_moment = 'Reserva' where id = 'wedding-test'
$$, 'The reserve section can be renamed');
select is((select backup_moment from public.setlists where id = 'wedding-test'), 'Reserva', 'And the new name is what comes back');
select throws_ok($$
  update public.setlists set backup_moment = repeat('x', 41) where id = 'wedding-test'
$$, '23514', null, 'A section name has a ceiling');
select throws_ok($$
  update public.setlists set backup_moment = '' where id = 'wedding-test'
$$, '23514', null, 'And is not empty');

select throws_ok($$
  update public.setlists set kind = 'boda-con-cena' where id = 'wedding-test'
$$, '23514', null, 'Unknown kinds remain rejected');

select ok((select relrowsecurity from pg_class where oid = 'public.setlists'::regclass), 'RLS remains enabled');

-- El enlace compartido enseña las secciones, y nada de cómo está guardado.
select ok(
  (select 'moments' = any(proargnames) from pg_proc where oid = 'public.shared_setlist(text)'::regprocedure),
  'A shared link carries the sections'
);
select ok(
  (select 'backup_moment' = any(proargnames) from pg_proc where oid = 'public.shared_setlist(text)'::regprocedure),
  'And which of them is the reserve'
);
select ok(
  (select not ('owner_id' = any(proargnames)) from pg_proc where oid = 'public.shared_setlist(text)'::regprocedure),
  'And still carries nothing internal'
);

-- Las mismas políticas de siempre, con el tipo nuevo.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000009b1","role":"authenticated"}';
select is((select count(*) from public.setlists where id = 'wedding-test'), 0::bigint, 'Another account cannot read the wedding');
reset role;

-- La puerta pública sigue siendo la de siempre: de su dueño, con el camino
-- cerrado y abierta sólo a los dos roles de siempre.
select ok(
  (select prosecdef from pg_proc where oid = 'public.shared_setlist(text)'::regprocedure),
  'shared_setlist still reads as its owner'
);
select ok(
  has_function_privilege('anon', 'public.shared_setlist(text)', 'execute')
  and has_function_privilege('authenticated', 'public.shared_setlist(text)', 'execute'),
  'shared_setlist keeps the same two roles'
);
select is(
  (select count(*) from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'public.shared_setlist(text)'::regprocedure and a.grantee = 0),
  0::bigint,
  'shared_setlist is not open to PUBLIC'
);
select is(
  (select btrim(o.option_value, '"') from pg_proc p, pg_options_to_table(p.proconfig) o
    where p.oid = 'public.shared_setlist(text)'::regprocedure and o.option_name = 'search_path'),
  '',
  'shared_setlist keeps its search_path closed'
);
-- Un enlace que no existe sigue sin decir nada, y uno con mala forma ni se busca.
select is((select count(*) from public.shared_setlist(repeat('a', 32))), 0::bigint, 'An unknown token says nothing');
select is((select count(*) from public.shared_setlist('no-es-un-token')), 0::bigint, 'A malformed token says nothing');

select * from finish();
rollback;
