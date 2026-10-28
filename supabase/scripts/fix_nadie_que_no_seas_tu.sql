-- ESCRITO A MANO. No sale del generador y no se regenera: los import_*.sql
-- insertan filas nuevas, y esta canción ya está publicada.
--
-- Qué corrige
-- -----------
-- «Nadie que no seas tú» se importó con el acorde La metido dentro de la
-- palabra «de» («Nada d[A]e nada»), que en una hoja no se puede leer: el
-- acorde parte la palabra por la mitad. El catálogo empaquetado ya lo lleva
-- apoyado al principio de esa misma palabra («Nada [A]de nada»), que conserva
-- dónde entra el acorde sin fingir una sincronía por sílabas que la hoja de
-- acordes no da. Esto deja la fila publicada igual que el empaquetado.
--
-- Son dos sitios: el coro en Mi y su repetición de cierre. El acorde se mueve
-- dos caracteres; no cambia ni una letra de la canción.
--
-- Historial
-- ---------
-- La versión 1 no se reescribe: queda como está, con lo que de verdad se
-- publicó. Esto publica una versión 2 con el contenido corregido, igual que
-- hace approve_submission cuando aprueba una corrección. Sin submission y sin
-- revisor, porque esta corrección no viene de una propuesta de nadie.
--
-- De qué se protege
-- -----------------
-- No se fía de contar acordes. Antes de tocar nada comprueba el contenido
-- entero por su huella, que la canción esté en la versión 1 y que no haya
-- ninguna versión posterior. Si la fila no es exactamente la que se publicó,
-- se detiene: significa que alguien editó la canción por otro camino, y
-- entonces esta corrección ya no sabe lo que está arreglando.
--
-- Si ya está corregida, lo dice y sale sin crear ninguna versión. Se puede
-- ejecutar dos veces sin dejar una versión 3 vacía.
--
-- Todo o nada: el bloque entero es una transacción. Cualquier comprobación
-- que falle lo revierte sin dejar rastro.
do $fix$
declare
  v_id        constant text    := 'nadie-que-no-seas-tu';
  v_malo      constant text    := 'Nada d[A]e nada, de nada, de na';
  v_bueno     constant text    := 'Nada [A]de nada, de nada, de na';
  v_esperado  constant integer := 2;
  -- La canción tal como se publicó, y tal como debe quedar. Comprobado
  -- contra el catálogo empaquetado y contra la fila viva de Supabase.
  v_sha_antes constant text    := '3a3259ca14af8fe3bbd9b5dd61f18c2d824d2da1f5b9b31495e6b59fa121915e';
  v_sha_tras  constant text    := '4cc0118d7454a09bd85380e06379c2b0a14d86d6ab6e2d435fd16d29339121ad';
  v_version_esperada constant integer := 1;
  v_fila      public.songs%rowtype;
  v_sha       text;
  v_nuevo     text;
  v_cuantos   integer;
  v_version   integer;
  v_sha_v1    text;
begin
  -- La fila se bloquea: nadie puede publicar otra versión a la vez.
  select * into v_fila from public.songs s where s.id = v_id for update;
  if not found then
    raise exception 'GENESARET:fix:no_existe %', v_id;
  end if;

  v_sha := encode(extensions.digest(v_fila.content, 'sha256'), 'hex');

  -- 1) Ya corregida. Se sale antes de cualquier otra comprobación: una
  --    segunda ejecución no tiene nada que mirar ni nada que escribir.
  if v_sha = v_sha_tras then
    raise notice 'Ya estaba corregida (versión %). No se crea ninguna versión.', v_fila.current_version;
    return;
  end if;

  -- 2) Y si no es la corregida, tiene que ser exactamente la publicada.
  --    Contar apariciones del acorde no basta: eso no vería una edición en
  --    cualquier otra parte de la letra.
  if v_sha <> v_sha_antes then
    raise exception 'GENESARET:fix:contenido_distinto_del_publicado (sha256 %)', v_sha;
  end if;

  -- 3) En la versión 1, que es la única que esta corrección sabe corregir.
  if v_fila.current_version <> v_version_esperada then
    raise exception 'GENESARET:fix:version_vigente_% (esperaba %)', v_fila.current_version, v_version_esperada;
  end if;

  -- 4) Y sin ninguna versión posterior en el historial. Si la hubiera,
  --    alguien publicó algo después y esto no debe pasar por encima.
  if exists (select 1 from public.song_versions v where v.song_id = v_id and v.version > v_version_esperada) then
    raise exception 'GENESARET:fix:hay_versiones_posteriores_a_la_%', v_version_esperada;
  end if;

  v_cuantos := (char_length(v_fila.content) - char_length(replace(v_fila.content, v_malo, '')))
               / char_length(v_malo);
  if v_cuantos <> v_esperado then
    raise exception 'GENESARET:fix:esperaba % apariciones y hay %', v_esperado, v_cuantos;
  end if;

  v_nuevo := replace(v_fila.content, v_malo, v_bueno);

  -- Lo único que puede cambiar es dónde está el acorde. Quitando las marcas
  -- de La de las dos versiones, el texto tiene que quedar idéntico; y el
  -- resultado tiene que ser exactamente el contenido corregido conocido.
  if char_length(v_nuevo) <> char_length(v_fila.content) then
    raise exception 'GENESARET:fix:la_longitud_cambio';
  end if;
  if replace(v_nuevo, '[A]', '') <> replace(v_fila.content, '[A]', '') then
    raise exception 'GENESARET:fix:la_letra_cambio';
  end if;
  if encode(extensions.digest(v_nuevo, 'sha256'), 'hex') <> v_sha_tras then
    raise exception 'GENESARET:fix:el_resultado_no_es_el_esperado';
  end if;

  update public.songs s
     set content = v_nuevo,
         current_version = s.current_version + 1
   where s.id = v_id
  returning s.current_version into v_version;

  -- La versión nueva, con la fila entera tal como queda publicada.
  insert into public.song_versions (song_id, version, snapshot, submission_id, published_by)
  select s.id, v_version, to_jsonb(s), null, null
  from public.songs s where s.id = v_id;

  -- La versión 1 sigue contando lo que de verdad se publicó. El disparador
  -- song_versions_immutable ya lo impide; esto lo deja dicho.
  select encode(extensions.digest(v.snapshot ->> 'content', 'sha256'), 'hex') into v_sha_v1
  from public.song_versions v where v.song_id = v_id and v.version = v_version_esperada;
  if v_sha_v1 is distinct from v_sha_antes then
    raise exception 'GENESARET:fix:la_version_% ya no conserva lo publicado', v_version_esperada;
  end if;

  raise notice 'Corregidas % apariciones. Publicada la versión %, con la % intacta.',
    v_cuantos, v_version, v_version_esperada;
end;
$fix$;
