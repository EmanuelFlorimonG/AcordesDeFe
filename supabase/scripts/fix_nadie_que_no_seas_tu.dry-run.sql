-- ESCRITO A MANO. Ensayo de fix_nadie_que_no_seas_tu.sql.
--
-- Hace la corrección entera, comprueba cómo queda, y lo revierte todo. No
-- deja nada escrito: termina lanzando siempre una excepción, que es lo que
-- devuelve la transacción a su sitio. Un «DRY-RUN OK» en la salida significa
-- que la corrección de verdad va a funcionar.
--
-- Lleva las mismas protecciones que el definitivo —huella del contenido
-- publicado, versión vigente, ninguna versión posterior— y además comprueba
-- el resultado: que no quede ninguna forma vieja, que queden las dos nuevas,
-- que la letra no cambiara, que la versión suba exactamente de uno, que el
-- resto de columnas estén intactas, y que la versión nueva quede guardada
-- sin tocar la vieja.
do $ensayo$
declare
  v_id        constant text    := 'nadie-que-no-seas-tu';
  v_malo      constant text    := 'Nada d[A]e nada, de nada, de na';
  v_bueno     constant text    := 'Nada [A]de nada, de nada, de na';
  v_esperado  constant integer := 2;
  v_sha_antes constant text    := '3a3259ca14af8fe3bbd9b5dd61f18c2d824d2da1f5b9b31495e6b59fa121915e';
  v_sha_tras  constant text    := '4cc0118d7454a09bd85380e06379c2b0a14d86d6ab6e2d435fd16d29339121ad';
  v_version_esperada constant integer := 1;
  v_antes     public.songs%rowtype;
  v_despues   public.songs%rowtype;
  v_sha       text;
  v_nuevo     text;
  v_cuantos   integer;
  v_version   integer;
  v_guardada  integer;
  v_sha_v1    text;
begin
  select * into v_antes from public.songs s where s.id = v_id for update;
  if not found then
    raise exception 'GENESARET:fix:no_existe %', v_id;
  end if;

  v_sha := encode(extensions.digest(v_antes.content, 'sha256'), 'hex');

  if v_sha = v_sha_tras then
    raise exception 'DRY-RUN OK: ya estaba corregida (versión %), no habría nada que hacer', v_antes.current_version;
  end if;
  if v_sha <> v_sha_antes then
    raise exception 'GENESARET:fix:contenido_distinto_del_publicado (sha256 %)', v_sha;
  end if;
  if v_antes.current_version <> v_version_esperada then
    raise exception 'GENESARET:fix:version_vigente_% (esperaba %)', v_antes.current_version, v_version_esperada;
  end if;
  if exists (select 1 from public.song_versions v where v.song_id = v_id and v.version > v_version_esperada) then
    raise exception 'GENESARET:fix:hay_versiones_posteriores_a_la_%', v_version_esperada;
  end if;

  v_cuantos := (char_length(v_antes.content) - char_length(replace(v_antes.content, v_malo, '')))
               / char_length(v_malo);
  if v_cuantos <> v_esperado then
    raise exception 'GENESARET:fix:esperaba % apariciones y hay %', v_esperado, v_cuantos;
  end if;

  v_nuevo := replace(v_antes.content, v_malo, v_bueno);
  if char_length(v_nuevo) <> char_length(v_antes.content) then
    raise exception 'GENESARET:fix:la_longitud_cambio';
  end if;
  if replace(v_nuevo, '[A]', '') <> replace(v_antes.content, '[A]', '') then
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

  insert into public.song_versions (song_id, version, snapshot, submission_id, published_by)
  select s.id, v_version, to_jsonb(s), null, null
  from public.songs s where s.id = v_id;

  -- --- Lo que tiene que haber pasado ---------------------------------------

  select * into v_despues from public.songs s where s.id = v_id;

  if encode(extensions.digest(v_despues.content, 'sha256'), 'hex') <> v_sha_tras then
    raise exception 'GENESARET:fix:el_contenido_guardado_no_es_el_esperado';
  end if;
  if position(v_malo in v_despues.content) > 0 then
    raise exception 'GENESARET:fix:sigue_partiendo_la_palabra';
  end if;
  if (char_length(v_despues.content) - char_length(replace(v_despues.content, v_bueno, '')))
     / char_length(v_bueno) <> v_esperado then
    raise exception 'GENESARET:fix:no_quedaron_las_% corregidas', v_esperado;
  end if;
  if replace(v_despues.content, '[A]', '') <> replace(v_antes.content, '[A]', '') then
    raise exception 'GENESARET:fix:la_letra_cambio_al_guardar';
  end if;
  if v_version <> v_antes.current_version + 1 then
    raise exception 'GENESARET:fix:la_version_salto de % a %', v_antes.current_version, v_version;
  end if;

  -- El resto de la canción, intacto.
  if v_despues.title is distinct from v_antes.title
     or v_despues.artist is distinct from v_antes.artist
     or v_despues.original_key is distinct from v_antes.original_key
     or v_despues.recommended_capo is distinct from v_antes.recommended_capo
     or v_despues.time_signature is distinct from v_antes.time_signature
     or v_despues.tempo is distinct from v_antes.tempo
     or v_despues.rhythm_pattern is distinct from v_antes.rhythm_pattern
     or v_despues.categories is distinct from v_antes.categories
     or v_despues.liturgical_seasons is distinct from v_antes.liturgical_seasons
     or v_despues.tags is distinct from v_antes.tags
     or v_despues.chords_used is distinct from v_antes.chords_used
     or v_despues.difficulty is distinct from v_antes.difficulty
     or v_despues.year is distinct from v_antes.year
     or v_despues.youtube_id is distinct from v_antes.youtube_id
     or v_despues.status is distinct from v_antes.status
     or v_despues.created_at is distinct from v_antes.created_at then
    raise exception 'GENESARET:fix:cambio_algo_mas_que_la_letra';
  end if;

  -- El historial: la nueva está, y la vieja sigue contando lo que se publicó.
  select count(*) into v_guardada
  from public.song_versions v where v.song_id = v_id and v.version = v_version;
  if v_guardada <> 1 then
    raise exception 'GENESARET:fix:la_version_% no quedó guardada (% filas)', v_version, v_guardada;
  end if;
  select encode(extensions.digest(v.snapshot ->> 'content', 'sha256'), 'hex') into v_sha_v1
  from public.song_versions v where v.song_id = v_id and v.version = v_version_esperada;
  if v_sha_v1 is distinct from v_sha_antes then
    raise exception 'GENESARET:fix:la_version_% ya no conserva lo publicado', v_version_esperada;
  end if;

  raise exception 'DRY-RUN OK: % apariciones corregidas, versión % -> % publicada y guardada, la % intacta (todo revertido)',
    v_cuantos, v_antes.current_version, v_version, v_version_esperada;
end;
$ensayo$;
