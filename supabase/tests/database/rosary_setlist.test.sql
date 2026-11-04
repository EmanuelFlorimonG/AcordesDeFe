-- Local Supabase only. All fixture changes are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email) values
 ('00000000-0000-0000-0000-0000000008a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rosary-test@example.com');

select lives_ok($$
  insert into public.setlists (owner_id, id, name, kind, client_created_at, client_updated_at)
  values ('00000000-0000-0000-0000-0000000008a1', 'rosary-test', 'Rosario de la Aurora', 'rosario-aurora', now(), now())
$$, 'The new occasion is accepted without a new payload format');

select is((select kind from public.setlists where id = 'rosary-test'), 'rosario-aurora', 'Kind survives storage');

select lives_ok($$
  insert into public.setlists (owner_id, id, name, kind, client_created_at, client_updated_at)
  values
   ('00000000-0000-0000-0000-0000000008a1', 'legacy-test', 'Old Mass', null, now(), now()),
   ('00000000-0000-0000-0000-0000000008a1', 'mass-test', 'Mass', 'misa', now(), now()),
   ('00000000-0000-0000-0000-0000000008a1', 'adoration-test', 'Adoration', 'adoracion', now(), now())
$$, 'All legacy kinds remain accepted');

select throws_ok($$
  update public.setlists set kind = 'unknown' where id = 'rosary-test'
$$, '23514', null, 'Unknown kinds remain rejected');

select lives_ok($$ update public.setlists set name = 'Rosario del sábado' where id = 'rosary-test' $$, 'Name remains editable');
select is((select kind from public.setlists where id = 'rosary-test'), 'rosario-aurora', 'Editing name preserves kind');
select ok((select relrowsecurity from pg_class where oid = 'public.setlists'::regclass), 'RLS remains enabled');

-- Exercise the same owner policies with the new kind, not just the RLS flag.
set local role anon;
select throws_ok($$ select * from public.setlists $$, '42501', null, 'Anonymous cannot read the new kind');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008b1","role":"authenticated"}';
select is((select count(*) from public.setlists where id = 'rosary-test'), 0::bigint, 'Another account cannot read the rosary');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008a1","role":"authenticated"}';
select is((select count(*) from public.setlists where id = 'rosary-test'), 1::bigint, 'The owner can read the rosary');
select lives_ok($$ update public.setlists set name = 'Rosario propio' where id = 'rosary-test' $$, 'The owner can edit the rosary');
reset role;

select * from finish();
rollback;
