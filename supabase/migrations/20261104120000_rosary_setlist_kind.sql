-- Add one occasion type to the existing column. No data, RLS or grants change.
begin;

do $$
declare
  constraint_name text;
begin
  -- The original migration also accepted a pre-existing, differently named check.
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.setlists'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%adoracion%'
  loop
    execute format('alter table public.setlists drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.setlists
  add constraint setlists_kind_check
  check (kind is null or kind in ('misa', 'adoracion', 'rosario-aurora'));

comment on column public.setlists.kind is
  'Celebración: adoracion o rosario-aurora; nulo conserva el formato histórico de Misa.';

commit;
