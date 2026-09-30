-- =============================================================================
-- Compartir un Setlist por enlace público
-- =============================================================================
-- Alguien prepara la misa del domingo y quiere que el coro la vea. Hasta
-- ahora la única forma era que todos tuvieran cuenta. Esto añade un enlace:
-- quien lo tenga ve el Setlist, sin registrarse y sin poder tocar nada.
--
-- Lo que NO cambia, y es lo importante:
--
--   * `public.setlists` sigue siendo privada exactamente igual que antes.
--     Ni una política nueva, ni un permiso nuevo, ni un `select` público.
--     Saber el id interno de un Setlist sigue sin servir para leerlo.
--   * El dueño de una fila sigue siendo `auth.uid()` y nada más.
--
-- Lo que se añade es una tabla de enlaces y una función que lee a través de
-- ella. La función es `security definer`: es la única puerta pública, y sólo
-- se abre con un token que nadie puede adivinar. Sin token no hay nada que
-- consultar — no existe ninguna consulta pública que enumere Setlists,
-- dueños ni enlaces.
--
-- QUÉ VERSIÓN SE VE
--
-- El enlace enseña siempre lo que la cuenta tiene guardado en la nube en ese
-- momento, no una copia congelada del día en que se compartió. Es lo que
-- espera quien comparte: corrige el tono de una canción, sincroniza, y el
-- coro ve la corrección sin volver a mandar nada. Y es una versión coherente
-- de verdad: es una fila completa de `setlists`, la misma que vería el dueño
-- en otro dispositivo, nunca un pegado de trozos de varias.
--
-- La consecuencia, que la aplicación dice en voz alta: un cambio hecho en el
-- móvil y todavía sin sincronizar no se ve por el enlace. Lo que se comparte
-- es la cuenta, no el dispositivo.
--
-- Migración aditiva: no toca songs, song_versions, song_submissions,
-- editorial_roles, submission_rate_events, setlists ni ninguna función
-- existente.

-- -----------------------------------------------------------------------------
-- Los enlaces
-- -----------------------------------------------------------------------------
create table public.setlist_shares (
  -- Lo único que hace falta para leer el Setlist, así que es lo único que
  -- tiene que ser imposible de adivinar. `gen_random_uuid()` viene del
  -- generador fuerte de Postgres: 122 bits de azar, sin extensiones.
  -- En hexadecimal y sin guiones, para que quepa en una URL sin escapar nada
  -- y para que un código QR no tenga que crecer de más.
  token text primary key
    default replace(gen_random_uuid()::text, '-', '')
    check (token ~ '^[0-9a-f]{32}$'),

  owner_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  setlist_id text not null,

  created_at timestamptz not null default now(),

  -- El enlace es de un Setlist que existe y que es de quien lo comparte. La
  -- clave foránea compuesta lo garantiza en la base de datos: no hay forma de
  -- compartir el Setlist de otra cuenta ni uno que no exista, ni siquiera
  -- desde un navegador modificado.
  -- `on delete cascade`: borrar el Setlist se lleva su enlace por delante.
  foreign key (owner_id, setlist_id)
    references public.setlists (owner_id, id) on delete cascade,

  -- Un enlace por Setlist. Volver a compartir después de desactivar da uno
  -- nuevo, que es justo lo que se quiere: el anterior queda muerto para
  -- siempre.
  unique (owner_id, setlist_id)
);

-- Leer por token es la consulta pública, y la clave primaria ya la resuelve.
-- Esta otra es la del dueño: "¿está compartido este Setlist mío?".
create index setlist_shares_owner_idx on public.setlist_shares (owner_id, setlist_id);

-- -----------------------------------------------------------------------------
-- El token lo pone la base de datos, siempre
-- -----------------------------------------------------------------------------
-- Si el navegador pudiera elegirlo, podría elegir uno malo: "1234…", o el
-- mismo para todo. El `default` sólo actúa cuando no se manda nada, así que
-- no basta. Esto lo sobrescribe siempre, venga lo que venga.
create or replace function public.setlist_shares_force_token()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.token := replace(gen_random_uuid()::text, '-', '');
  new.created_at := now();
  return new;
end;
$$;

create trigger setlist_shares_force_token
  before insert on public.setlist_shares
  for each row execute function public.setlist_shares_force_token();

-- El token tampoco se cambia después: un enlace es ese enlace. Para tener
-- otro se desactiva y se vuelve a crear.
create or replace function public.setlist_shares_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Un enlace no se modifica: se desactiva y se crea otro.'
    using errcode = 'P0001';
end;
$$;

create trigger setlist_shares_immutable
  before update on public.setlist_shares
  for each row execute function public.setlist_shares_immutable();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.setlist_shares enable row level security;

-- Como en el resto del esquema: primero se quita todo —"todos los
-- privilegios" incluye TRUNCATE, que no pasa por RLS— y luego se concede lo
-- justo.
revoke all on public.setlist_shares from anon, authenticated;

-- El público no toca esta tabla en absoluto. Ni para leer: quien tiene el
-- enlace lee el Setlist por la función de abajo, nunca la tabla, así que no
-- hay ninguna consulta que devuelva tokens, dueños ni cuántos enlaces hay.
grant select, insert, delete on public.setlist_shares to authenticated;
-- Sin update: el enlace no se edita (y el trigger de arriba lo repite).

create policy setlist_shares_owner_select on public.setlist_shares
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy setlist_shares_owner_insert on public.setlist_shares
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- Desactivar es borrar la fila. Inmediato: la función de lectura busca por
-- token, y a partir de ese instante no encuentra nada.
create policy setlist_shares_owner_delete on public.setlist_shares
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- La puerta pública
-- -----------------------------------------------------------------------------
-- Una sola función, de sólo lectura, que devuelve un Setlist a quien traiga
-- su token. `security definer` porque tiene que leer una tabla privada; por
-- eso mismo es lo más estrecho posible:
--
--   * `stable`, sin una sola escritura;
--   * devuelve columnas elegidas a mano: ni `owner_id`, ni `deleted_at`, ni
--     los relojes del servidor. Quien abre el enlace ve un Setlist, no una
--     fila de base de datos;
--   * un Setlist borrado no se devuelve: la lápida deja el enlace mudo;
--   * `set search_path = ''` y todo cualificado con su esquema, para que
--     nadie pueda colar otra tabla por delante.
create or replace function public.shared_setlist(share_token text)
returns table (
  id text,
  name text,
  date text,
  description text,
  items jsonb,
  payload_version smallint,
  revision integer,
  client_created_at timestamptz,
  client_updated_at timestamptz,
  shared_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.date, s.description, s.items, s.payload_version,
         s.revision, s.client_created_at, s.client_updated_at, k.created_at
  from public.setlist_shares k
  join public.setlists s
    on s.owner_id = k.owner_id and s.id = k.setlist_id
  -- La forma se comprueba antes de buscar: un token que no puede existir no
  -- llega a ser una consulta.
  where share_token ~ '^[0-9a-f]{32}$'
    and k.token = share_token
    and s.deleted_at is null;
$$;

revoke all on function public.shared_setlist(text) from public;
grant execute on function public.shared_setlist(text) to anon, authenticated;

-- Los triggers no se llaman desde la API; nadie necesita ejecutarlos.
revoke all on function public.setlist_shares_force_token() from public;
revoke all on function public.setlist_shares_immutable() from public;
