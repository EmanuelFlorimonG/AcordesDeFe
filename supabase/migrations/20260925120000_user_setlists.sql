-- =============================================================================
-- Setlists de cada cuenta
-- =============================================================================
-- Un setlist es de quien lo hizo. Hasta ahora vivía sólo en su dispositivo;
-- esta tabla es la copia que le permite encontrarlo desde otro. Nada más:
-- el cancionero sigue siendo público, la aplicación entera sigue
-- funcionando sin cuenta, y quien no inicie sesión no toca esta tabla.
--
-- Lo que decide de quién es una fila es `auth.uid()`, y nada más: ni el
-- correo, ni el nombre que alguien se ponga, ni editorial_roles, que sigue
-- siendo exclusivamente para revisar el catálogo. Row Level Security lo hace
-- cumplir en la base de datos, así que un navegador modificado no obtiene
-- nada que no sea suyo.
--
-- La clave primaria es (owner_id, id): el id es el que el setlist ya tiene en
-- el dispositivo, y dos personas pueden tener el mismo sin estorbarse. Eso
-- importa de verdad en un navegador compartido, donde dos cuentas pueden
-- querer guardar los mismos setlists de invitado.
--
-- Migración aditiva: no toca songs, song_versions, song_submissions,
-- editorial_roles, submission_rate_events ni ninguna función existente.

create table public.setlists (
  owner_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  -- El id que ya tiene en el dispositivo (crypto.randomUUID o el de reserva).
  id text not null
    check (char_length(id) between 8 and 64 and id !~ '\s'),

  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- "YYYY-MM-DD", o nada cuando la celebración no tiene fecha.
  date text check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  description text check (char_length(description) <= 500),

  -- Las entradas tal como las guarda el dispositivo. Un setlist se lee
  -- entero, nunca por partes, así que es un documento y no tres tablas.
  -- El tamaño se mide sobre el JSON que se acepta, no sobre lo que Postgres
  -- termine guardando comprimido: lo que se quiere acotar es el payload.
  items jsonb not null default '[]'::jsonb
    check (jsonb_typeof(items) = 'array'
           and jsonb_array_length(items) <= 200
           and octet_length(items::text) <= 200000),

  -- Qué versión de la representación es esta fila. La 1 no lleva los ids de
  -- los miembros (participantes ni voces asignadas): siguen siendo locales
  -- mientras no exista sincronización de miembros. Un cliente nunca escribe
  -- una fila cuya versión no entienda.
  payload_version smallint not null default 1 check (payload_version >= 1),

  -- Concurrencia optimista: quien escribe dice qué revisión leyó.
  revision integer not null default 1 check (revision >= 1),

  -- Los relojes del dispositivo, que son los que la persona ve…
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  -- …y los del servidor, que son los que mandan al sincronizar.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Lápida: un borrado tiene que llegar a un dispositivo que estaba sin
  -- conexión, así que la fila se marca en vez de desaparecer.
  deleted_at timestamptz,

  primary key (owner_id, id)
);

-- Traer lo que cambió desde la última sincronización. La clave primaria ya
-- cubre "todo lo de este dueño", así que no hace falta ningún índice más.
create index setlists_owner_changed_idx on public.setlists (owner_id, updated_at desc);

create trigger setlists_set_updated_at
  before update on public.setlists
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.setlists enable row level security;

-- Supabase concede todos los privilegios a los roles públicos en cada tabla
-- nueva, y "todos" incluye TRUNCATE, que no pasa por Row Level Security: una
-- sola cuenta podría vaciar los setlists de todo el mundo. Así que primero se
-- quita todo, como en el catálogo editorial, y luego se concede lo justo.
revoke all on public.setlists from anon, authenticated;
-- El público no tiene nada que hacer aquí: estos setlists son privados.
-- Quien ha iniciado sesión alcanza los suyos, y sólo los suyos, por las
-- políticas de abajo.
grant select, insert, update, delete on public.setlists to authenticated;

-- (select auth.uid()) se evalúa una vez por consulta, no una vez por fila.
create policy setlists_owner_select on public.setlists
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy setlists_owner_insert on public.setlists
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- El `with check` es lo que impide regalar una fila a otra cuenta o robarla.
create policy setlists_owner_update on public.setlists
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy setlists_owner_delete on public.setlists
  for delete to authenticated
  using (owner_id = (select auth.uid()));
