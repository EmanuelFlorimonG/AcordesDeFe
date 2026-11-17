-- Una boda es un Setlist más, y sus secciones son suyas.
--
-- Dos cosas, las dos pequeñas y las dos en la misma tabla:
--
--   1. `kind` admite dos valores más: 'boda' y 'boda-sin-misa'. Son dos
--      modalidades de lo mismo —lo que las separa son las partes
--      eucarísticas— y por eso son dos valores y no una columna aparte.
--
--   2. `moments` guarda las secciones de un Setlist concreto, en orden, y
--      `backup_moment` dice cuál de ellas es la reserva cuando no se llama
--      «Backup»: así se puede renombrar la sección de reserva sin que sus
--      canciones se metan en el recorrido de la celebración.
--      Nulo significa «las de su tipo», que es lo que dicen todas las filas
--      que existen hoy y lo que seguirá diciendo cualquier misa. Hace falta
--      porque una boda se prepara renombrando, moviendo, añadiendo y quitando
--      sus partes, y una sección vacía —preparada antes de tener la canción—
--      no cabe en `items`: allí sólo hay canciones.
--
-- Lo que NO hace: no toca una sola fila, ni los permisos, ni las políticas,
-- ni `items`, ni ninguna otra tabla. Una aplicación con la versión anterior
-- sigue funcionando igual: pide las columnas por su nombre y ésta no está en
-- su lista, así que ni la ve ni la pisa.
--
-- IMPORTANTE para el despliegue: esto va ANTES que la aplicación. El navegador
-- nuevo pide `moments` al leer, y pedírsela a una base que todavía no la tiene
-- rompe la sincronización entera, no sólo las bodas. Al revés no pasa nada:
-- esta migración sola, con la aplicación anterior, no cambia nada para nadie.
--
-- Se puede ejecutar sobre una base donde un intento anterior se quedó a medias:
-- todo comprueba antes si ya está hecho.

begin;

-- -----------------------------------------------------------------------------
-- Las dos modalidades de boda
-- -----------------------------------------------------------------------------
--
-- La restricción se busca por lo que dice y no por cómo se llama, igual que
-- hizo la del rosario: puede haberla puesto Postgres con su propio nombre.

do $$
declare
  nombre text;
begin
  for nombre in
    select conname from pg_constraint
    where conrelid = 'public.setlists'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%adoracion%'
  loop
    execute format('alter table public.setlists drop constraint %I', nombre);
  end loop;
end $$;

alter table public.setlists
  add constraint setlists_kind_check
  check (kind is null or kind in ('misa', 'adoracion', 'rosario-aurora', 'boda', 'boda-sin-misa'));

comment on column public.setlists.kind is
  'Celebración: adoracion, rosario-aurora, boda o boda-sin-misa; nulo conserva el formato histórico de Misa.';

-- -----------------------------------------------------------------------------
-- Las secciones propias
-- -----------------------------------------------------------------------------

alter table public.setlists
  add column if not exists moments jsonb;

-- Lo que se comprueba aquí es la forma, no el contenido: una lista con algo
-- dentro y con un tope. Que cada elemento sea un texto corto lo garantiza
-- quien lee —el navegador repara lo que haya, como hace con `items`—, porque
-- una fila manipulada tiene que acabar en un Setlist más pobre, nunca en un
-- error. El tope existe para que nadie use esta columna de almacén.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.setlists'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%moments%'
  ) then
    alter table public.setlists
      add constraint setlists_moments_check
      check (
        moments is null
        or (jsonb_typeof(moments) = 'array' and jsonb_array_length(moments) between 1 and 40)
      );
  end if;
end $$;

comment on column public.setlists.moments is
  'Las secciones de este Setlist, en orden. Nulo significa las de su tipo, que es lo que son todos los anteriores.';

-- Cuál de esas secciones es la reserva. Nulo significa «la que se llame
-- Backup, si la hay», que es lo que son todos los Setlists anteriores. Que una
-- canción concreta sea reserva va dentro de `items`, con la canción: esto sólo
-- dice dónde entran las que se añadan a partir de ahora.
alter table public.setlists
  add column if not exists backup_moment text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.setlists'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%backup_moment%'
  ) then
    alter table public.setlists
      add constraint setlists_backup_moment_check
      check (backup_moment is null or char_length(backup_moment) between 1 and 40);
  end if;
end $$;

comment on column public.setlists.backup_moment is
  'Cuál de las secciones es la reserva. Nulo significa la que se llame Backup, que es lo que son todos los anteriores.';

-- -----------------------------------------------------------------------------
-- La puerta pública, con una columna más
-- -----------------------------------------------------------------------------
--
-- Quien abre un enlace ve el mismo Setlist que vería su dueño, así que también
-- ve sus secciones: sin esto, una boda compartida aparecería con la plantilla
-- del tipo en vez de con las partes que alguien preparó.
--
-- Hay que tirarla y volver a levantarla: añadir una columna al resultado cambia
-- la forma de lo que devuelve, y eso `create or replace` no lo hace. Tirarla se
-- lleva sus permisos, que se vuelven a dar abajo, exactamente los mismos. Sin
-- `cascade` a propósito: si algo dependiera de ella, mejor enterarse aquí.
drop function if exists public.shared_setlist(text);

create function public.shared_setlist(share_token text)
returns table (
  id text,
  name text,
  kind text,
  moments jsonb,
  backup_moment text,
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
  select s.id, s.name, s.kind, s.moments, s.backup_moment, s.date, s.description, s.items, s.payload_version,
         s.revision, s.client_created_at, s.client_updated_at, k.created_at
  from public.setlist_shares k
  join public.setlists s
    on s.owner_id = k.owner_id and s.id = k.setlist_id
  where share_token ~ '^[0-9a-f]{32}$'
    and k.token = share_token
    and s.deleted_at is null;
$$;

revoke all on function public.shared_setlist(text) from public;
grant execute on function public.shared_setlist(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Lo que tiene que haber quedado. Si no, la migración no pasa.
-- -----------------------------------------------------------------------------

do $$
declare
  definicion text;
  salida text[];
  camino text;
  publico int;
begin
  -- Los cinco tipos, y nada más.
  select pg_get_constraintdef(oid) into definicion
    from pg_constraint
   where conrelid = 'public.setlists'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%kind%adoracion%'
   limit 1;
  if definicion is null then
    raise exception 'setlists.kind se quedó sin restricción de valores';
  end if;
  if definicion not ilike '%boda%' or definicion not ilike '%boda-sin-misa%'
     or definicion not ilike '%rosario-aurora%' or definicion not ilike '%misa%'
     or definicion not ilike '%null%' then
    raise exception 'La restricción de setlists.kind no es la esperada: %', definicion;
  end if;

  -- La columna existe, es jsonb y admite nulo: lo que son todas las filas de hoy.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'setlists'
       and column_name = 'moments' and data_type = 'jsonb' and is_nullable = 'YES'
  ) then
    raise exception 'La columna setlists.moments no quedó como se esperaba';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'setlists'
       and column_name = 'backup_moment' and data_type = 'text' and is_nullable = 'YES'
  ) then
    raise exception 'La columna setlists.backup_moment no quedó como se esperaba';
  end if;
  if exists (select 1 from public.setlists where moments is not null or backup_moment is not null) then
    raise exception 'Esta migración no escribe secciones en ninguna fila';
  end if;

  -- La función sigue existiendo, con el mismo nombre y el mismo argumento.
  if to_regprocedure('public.shared_setlist(text)') is null then
    raise exception 'public.shared_setlist(text) no existe';
  end if;

  -- Devuelve las secciones, y sigue sin devolver nada de cómo está guardado.
  select proargnames into salida
    from pg_proc
   where oid = 'public.shared_setlist(text)'::regprocedure;
  if not ('moments' = any(salida)) or not ('kind' = any(salida))
     or not ('backup_moment' = any(salida)) then
    raise exception 'shared_setlist no devuelve kind, moments y backup_moment: %', salida;
  end if;
  if 'owner_id' = any(salida) or 'deleted_at' = any(salida)
     or 'created_at' = any(salida) or 'updated_at' = any(salida) then
    raise exception 'shared_setlist devuelve columnas internas: %', salida;
  end if;

  -- Sigue leyendo como su dueño, con el camino cerrado y los permisos de siempre.
  if not exists (
    select 1 from pg_proc
     where oid = 'public.shared_setlist(text)'::regprocedure and prosecdef
  ) then
    raise exception 'shared_setlist perdió security definer';
  end if;

  select o.option_value into camino
    from pg_proc p, pg_options_to_table(p.proconfig) o
   where p.oid = 'public.shared_setlist(text)'::regprocedure
     and o.option_name = 'search_path';
  if camino is null or btrim(camino, '"') <> '' then
    raise exception 'shared_setlist tiene un search_path abierto: %', coalesce(camino, '(ninguno)');
  end if;

  if not has_function_privilege('anon', 'public.shared_setlist(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.shared_setlist(text)', 'execute') then
    raise exception 'shared_setlist perdió sus permisos';
  end if;

  select count(*) into publico
    from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'public.shared_setlist(text)'::regprocedure
     and a.grantee = 0;
  if publico > 0 then
    raise exception 'shared_setlist quedó abierta a PUBLIC';
  end if;

  -- Y la tabla sigue cerrada.
  if not (select relrowsecurity from pg_class where oid = 'public.setlists'::regclass) then
    raise exception 'setlists se quedó sin RLS';
  end if;
end $$;

commit;
