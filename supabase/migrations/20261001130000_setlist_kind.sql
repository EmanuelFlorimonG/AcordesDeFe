-- Un Setlist dice de qué celebración es: una misa o una adoración.
--
-- Hasta ahora todos eran misas sin decirlo, y sus partes se llamaban Entrada,
-- Ofertorio, Santo. Una adoración se prepara igual —las mismas canciones, el
-- mismo orden, los mismos tonos y arreglos— pero sus momentos son otros: la
-- entrada del Señor, las peticiones al Espíritu Santo, la procesión. Lo único
-- que cambia es qué nombres se ofrecen al escribirlos.
--
-- Por eso esto es una columna y no una tabla: no hay dos clases de Setlist,
-- hay una con una palabra que dice de qué va.
--
-- Nulo significa misa. Las filas que ya existen lo son, y ninguna necesita
-- tocarse: lo que no dijo nada sigue sin decir nada, y sigue significando lo
-- mismo. Un dispositivo con la versión anterior de la aplicación tampoco se
-- entera, porque pide las columnas por su nombre y ésta no estaba en su lista.
--
-- Esta migración se puede ejecutar sobre una base de datos donde un intento
-- anterior se quedó a medias. Todo lo que hace comprueba antes si ya está
-- hecho, y lo hace entero o no lo hace: si algo falla, no queda la mitad.

begin;

-- -----------------------------------------------------------------------------
-- La columna
-- -----------------------------------------------------------------------------

alter table public.setlists
  add column if not exists kind text;

-- La restricción va aparte y con su propio nombre, porque la columna puede
-- existir ya de un intento anterior y entonces nadie la habría puesto. Se
-- busca por lo que dice, no por cómo se llama: así da igual si la nombró
-- Postgres o la nombramos aquí.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.setlists'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%kind%adoracion%'
  ) then
    alter table public.setlists
      add constraint setlists_kind_check
      check (kind is null or kind in ('misa', 'adoracion'));
  end if;
end $$;

comment on column public.setlists.kind is
  'De qué celebración es: ''adoracion'', o nulo para una misa, que es lo que fueron todos hasta ahora.';

-- -----------------------------------------------------------------------------
-- La puerta pública, con una columna más
-- -----------------------------------------------------------------------------
--
-- Quien abre un enlace compartido ve el mismo Setlist que vería su dueño, así
-- que también ve de qué celebración es: sin eso, una adoración compartida
-- aparecería con los momentos de una misa.
--
-- Hay que tirarla y volver a levantarla. Añadir una columna al resultado
-- cambia la forma de lo que devuelve, y eso `create or replace` no lo hace:
-- Postgres se niega, y hace bien, porque cualquiera que la estuviera usando
-- esperaba la forma de antes.
--
-- Tirarla se lleva por delante sus permisos, así que se vuelven a dar abajo,
-- exactamente los mismos que tenía. Y se tira sin `cascade` a propósito: si
-- algo dependiera de ella, preferimos enterarnos aquí que descubrirlo después.
drop function if exists public.shared_setlist(text);

-- Todo lo demás se mantiene igual que el primer día:
--
--   * `stable`, sin una sola escritura;
--   * devuelve columnas elegidas a mano: ni `owner_id`, ni `deleted_at`, ni
--     los relojes del servidor. Quien abre el enlace ve un Setlist, no una
--     fila de base de datos;
--   * un Setlist borrado no se devuelve: la lápida deja el enlace mudo;
--   * `set search_path = ''` y todo cualificado con su esquema, para que
--     nadie pueda colar otra tabla por delante.
create function public.shared_setlist(share_token text)
returns table (
  id text,
  name text,
  kind text,
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
  select s.id, s.name, s.kind, s.date, s.description, s.items, s.payload_version,
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
  -- La columna existe, y es de texto.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'setlists'
       and column_name = 'kind' and data_type = 'text'
  ) then
    raise exception 'La columna setlists.kind no existe';
  end if;

  -- Y sólo admite nulo, misa o adoración.
  select pg_get_constraintdef(oid) into definicion
    from pg_constraint
   where conrelid = 'public.setlists'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%kind%adoracion%'
   limit 1;
  if definicion is null then
    raise exception 'setlists.kind no tiene restricción de valores';
  end if;
  if definicion not ilike '%misa%' or definicion not ilike '%null%' then
    raise exception 'La restricción de setlists.kind no es la esperada: %', definicion;
  end if;

  -- La función existe, con el mismo nombre y el mismo argumento.
  if to_regprocedure('public.shared_setlist(text)') is null then
    raise exception 'public.shared_setlist(text) no existe';
  end if;

  -- Devuelve `kind`, y sigue sin devolver nada de cómo está guardado.
  select proargnames into salida
    from pg_proc
   where oid = 'public.shared_setlist(text)'::regprocedure;
  if not ('kind' = any(salida)) then
    raise exception 'shared_setlist no devuelve kind';
  end if;
  if 'owner_id' = any(salida) or 'deleted_at' = any(salida)
     or 'created_at' = any(salida) or 'updated_at' = any(salida) then
    raise exception 'shared_setlist devuelve columnas internas: %', salida;
  end if;

  -- Sigue leyendo como su dueño.
  if not exists (
    select 1 from pg_proc
     where oid = 'public.shared_setlist(text)'::regprocedure and prosecdef
  ) then
    raise exception 'shared_setlist perdió security definer';
  end if;

  -- Y sigue con el camino cerrado.
  --
  -- Se pregunta por la propiedad, no por cómo se escribe: `search_path` es un
  -- parámetro de lista, así que PostgreSQL guarda sus valores entrecomillados
  -- y un camino vacío acaba siendo `search_path=""`, no `search_path=`. Con
  -- `pg_options_to_table` se lee el valor sin depender de esa forma.
  select o.option_value into camino
    from pg_proc p, pg_options_to_table(p.proconfig) o
   where p.oid = 'public.shared_setlist(text)'::regprocedure
     and o.option_name = 'search_path';
  if camino is null then
    raise exception 'shared_setlist no fija search_path';
  end if;
  if btrim(camino, '"') <> '' then
    raise exception 'shared_setlist tiene un search_path abierto: %', camino;
  end if;

  -- Y los permisos son los de siempre: estos dos roles, y nadie más.
  if not has_function_privilege('anon', 'public.shared_setlist(text)', 'execute') then
    raise exception 'anon no puede ejecutar shared_setlist';
  end if;
  if not has_function_privilege('authenticated', 'public.shared_setlist(text)', 'execute') then
    raise exception 'authenticated no puede ejecutar shared_setlist';
  end if;

  select count(*) into publico
    from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'public.shared_setlist(text)'::regprocedure
     and a.grantee = 0;
  if publico > 0 then
    raise exception 'shared_setlist sigue abierta a PUBLIC';
  end if;
end $$;

commit;
