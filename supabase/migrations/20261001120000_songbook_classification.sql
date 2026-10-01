-- Clasificación del cancionero: tiempos litúrgicos, categorías y cuatro bajas.
--
-- El ministerio revisó el cancionero entero canción por canción. De ahí salen
-- cuatro cosas, y ninguna toca cómo está construida la tabla:
--
--   * cuatro canciones salen del cancionero: tres porque no se cantan, y «Te
--     Presentamos el Vino y el Pan (II)» porque estaba repetida;
--   * el tiempo litúrgico deja de ser decorativo. Antes casi todo era «todo el
--     año» y Cuaresma no existía; ahora cada canción dice en qué tiempos se
--     canta de verdad, que es lo que hace que buscar por tiempo sirva de algo;
--   * «Paz» y «Jornadas» desaparecen como categorías, «María» pasa a llamarse
--     «Marianas», y aparecen «Claretiana» (el repertorio propio de la casa, que
--     estaba escondido bajo «Otros») y «PostComunión»;
--   * «Gloria a Dios en el Cielo (Pascua)» pierde el paréntesis: el tiempo vive
--     en su campo, no en el título.
--
-- Sobre las cuatro bajas: salen del cancionero ocultándose, no borrándose.
-- Esta base de datos ya decidió eso el primer día y lo dejó escrito al lado de
-- la columna: «Songs are hidden, never deleted: versions and local lists point
-- at them». Una canción publicada tiene historial en 'song_versions', que la
-- referencia con 'on delete restrict' y que un trigger protege de cualquier
-- borrado; quitarla a la fuerza obligaría a destruir ese historial y a
-- desactivar la guarda que lo defiende.
--
-- Ocultarla hace exactamente lo que el ministerio pidió. Deja de estar en el
-- cancionero para todo el mundo: la política de lectura pública sólo enseña
-- 'status = published', y todas las consultas de la aplicación lo piden.
-- Nadie la encuentra, nadie la abre, y nada de lo que apunta a ella se rompe.
--
-- Quitar una categoría no quita ninguna canción. «La Paz te Doy» y «No Hay un
-- Saludo Más Lindo» se quedan en el cancionero sin categoría hasta que el
-- ministerio decida dónde van.
--
-- Nada de esto cambia el esquema, los permisos ni las políticas: son filas de
-- 'songs'. Y se puede volver a ejecutar sin hacer daño, que es lo que hace
-- falta cuando un primer intento se quedó a medias.

begin;

-- Las cuatro que salen del cancionero. Su historial se queda donde está.
update public.songs set status = 'hidden' where id = 'alfarero'; -- Alfarero
update public.songs set status = 'hidden' where id = 'estamos-de-fiesta-con-jesus'; -- Estamos de Fiesta con Jesús
update public.songs set status = 'hidden' where id = 'pescador-de-hombres'; -- Pescador de Hombres
update public.songs set status = 'hidden' where id = 'te-presentamos-el-vino-y-el-pan-ii'; -- Te Presentamos el Vino y el Pan (II)

-- Y cada una de las que se quedan, con lo que cambia.
update public.songs set liturgical_seasons = array['tiempo-ordinario']::text[] where id = 'abba-padre-venga-tu-reino';
update public.songs set liturgical_seasons = array['navidad', 'tiempo-ordinario', 'pascua']::text[] where id = 'atentos-a-escuchar';
update public.songs set liturgical_seasons = array['tiempo-ordinario']::text[] where id = 'bendecire-al-senor';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua']::text[] where id = 'bendito-sea-dios';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'pascua']::text[] where id = 'buscamos-un-avivamiento';
update public.songs set liturgical_seasons = array['cuaresma']::text[] where id = 'cirineo';
update public.songs set categories = array['Claretiana']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'claret-cristiano-de-fuego';
update public.songs set categories = array['Claretiana']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'claret-fuego-ardiente';
update public.songs set categories = array['Claretiana']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'claret-misionero-de-luz';
update public.songs set categories = array['Claretiana']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'como-claret-misionero-quiero-ser';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'cuaresma']::text[] where id = 'como-el-padre-me-amo';
update public.songs set categories = array['Claretiana']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'consagracion-filial';
update public.songs set categories = array['Marianas', 'Adoración']::text[] where id = 'contigo-maria';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua']::text[] where id = 'cordero-de-dios-nuevo';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua']::text[] where id = 'cordero-via-raisa';
update public.songs set liturgical_seasons = array['pascua']::text[] where id = 'cristo-salvador';
update public.songs set categories = array['Claretiana']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'danza-claretiana';
update public.songs set categories = array['Claretiana']::text[] where id = 'dibujo-perfecto';
update public.songs set liturgical_seasons = array['adviento', 'tiempo-ordinario']::text[] where id = 'dichoso';
update public.songs set categories = array['Alabanza']::text[] where id = 'digno-de-alabar';
update public.songs set categories = array['Claretiana']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'el-padre-claret';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua']::text[] where id = 'en-su-mesa-hay-amor';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'cuaresma']::text[] where id = 'entre-tus-manos';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'pascua']::text[] where id = 'es-mi-cuerpo-siempre-nos-ama-el-senor';
update public.songs set liturgical_seasons = array['adviento', 'tiempo-ordinario']::text[] where id = 'es-un-deleite';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua']::text[] where id = 'este-pan-y-vino';
update public.songs set categories = array['Marianas']::text[] where id = 'estrella-del-cielo';
update public.songs set liturgical_seasons = array['tiempo-ordinario']::text[] where id = 'eucaristia-milagro-de-amor';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'pascua']::text[] where id = 'fiesta-de-fe';
update public.songs set categories = array['Hakuna']::text[] where id = 'forajidos-hakuna';
update public.songs set title = 'Gloria a Dios en el Cielo', liturgical_seasons = array['pascua']::text[] where id = 'gloria-a-dios-en-el-cielo-pascua';
update public.songs set categories = array['Claretiana']::text[] where id = 'hacia-ti';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua']::text[] where id = 'hemos-entregado';
update public.songs set categories = array['Claretiana']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'himno-a-claret';
update public.songs set liturgical_seasons = array['cuaresma']::text[] where id = 'hoy-perdoname';
update public.songs set liturgical_seasons = array['navidad', 'tiempo-ordinario', 'pascua']::text[] where id = 'hoy-senor-te-ofrecemos';
update public.songs set categories = array['Adoración', 'Hakuna']::text[] where id = 'huracan-hakuna';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'cuaresma']::text[] where id = 'jesus-amigo';
update public.songs set categories = array['Claretiana']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'la-fuerza-del-espiritu';
update public.songs set categories = array[]::text[] where id = 'la-paz-te-doy';
update public.songs set liturgical_seasons = array['adviento']::text[] where id = 'llegara-con-la-luz';
update public.songs set liturgical_seasons = array['cuaresma']::text[] where id = 'llevame-a-la-cruz';
update public.songs set categories = array['Claretiana']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'los-claretianos-unidos';
update public.songs set categories = array['Marianas']::text[] where id = 'maria-doncella-divina';
update public.songs set categories = array['Marianas', 'Salida']::text[] where id = 'maria-tu-que-velas-junto-a-mi';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'cuaresma']::text[] where id = 'me-has-seducido';
update public.songs set categories = array['Salida', 'Claretiana']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'mi-amigo-claret';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'cuaresma']::text[] where id = 'mi-barca-me-has-mirado-a-los-ojos';
update public.songs set categories = array['Claretiana']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'misionero-ideal';
update public.songs set liturgical_seasons = array['tiempo-ordinario']::text[] where id = 'nadie-te-ama-como-yo';
update public.songs set categories = array[]::text[] where id = 'no-hay-un-saludo-mas-lindo';
update public.songs set liturgical_seasons = array['tiempo-ordinario']::text[] where id = 'no-he-venido-a-pedirte';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua']::text[] where id = 'oh-cordero';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua']::text[] where id = 'peregrino';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua']::text[] where id = 'piedad-don-martin';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua']::text[] where id = 'piedad-via-raisa';
update public.songs set liturgical_seasons = array['navidad', 'tiempo-ordinario', 'pascua']::text[] where id = 'pongo-en-tus-manos';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'pascua']::text[] where id = 'popurri';
update public.songs set categories = array['Adoración', 'PostComunión']::text[], liturgical_seasons = array['tiempo-ordinario']::text[] where id = 'puedo-entrar';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'pascua']::text[] where id = 'que-alegria-cuando-me-dijeron';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua']::text[] where id = 'queremos-escuchar-tu-voz';
update public.songs set liturgical_seasons = array['adviento', 'tiempo-ordinario']::text[] where id = 'quiero-agradecer';
update public.songs set categories = array['Marianas']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'salve-regina';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua']::text[] where id = 'santo-joel';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'pascua']::text[] where id = 'santo-juvenil';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua']::text[] where id = 'santo-lento';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'pascua']::text[] where id = 'santo-merengue';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'pascua']::text[] where id = 'santo-swing';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'pascua']::text[] where id = 'santo-via-raisa';
update public.songs set liturgical_seasons = array['pascua']::text[] where id = 'siempre-es-pentecostes';
update public.songs set liturgical_seasons = array['tiempo-ordinario']::text[] where id = 'somos-un-pueblo-que-camina';
update public.songs set liturgical_seasons = array['navidad', 'tiempo-ordinario', 'pascua']::text[] where id = 'su-palabra-es-la-verdad';
update public.songs set liturgical_seasons = array['tiempo-ordinario', 'pascua']::text[] where id = 'te-ofrecemos-nuestra-juventud';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'pascua']::text[] where id = 'te-presentamos-el-vino-y-el-pan';
update public.songs set liturgical_seasons = array['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua']::text[] where id = 'ten-piedad';
update public.songs set categories = array['Claretiana']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'un-cantar-para-claret';
update public.songs set categories = array['Claretiana']::text[], liturgical_seasons = array['todo-el-ano']::text[] where id = 'vamos-claretianos';
update public.songs set liturgical_seasons = array['adviento', 'cuaresma']::text[] where id = 'ven-senor-no-tardes';
update public.songs set liturgical_seasons = array['tiempo-ordinario']::text[] where id = 'vienen-con-alegria';
update public.songs set liturgical_seasons = array['adviento', 'tiempo-ordinario']::text[] where id = 'yo-siento-senor';
update public.songs set liturgical_seasons = array['pascua']::text[] where id = 'yo-soy-el-pan-de-vida';

-- Lo que tiene que haber quedado. Si no, la migración no pasa.
do $$
declare
  cuantas int;
  sobran int;
begin
  select count(*) into cuantas from public.songs where status = 'published';
  if cuantas <> 106 then
    raise exception 'El cancionero debería tener 106 canciones y tiene %', cuantas;
  end if;

  -- Ninguna de las cuatro sigue en el cancionero…
  select count(*) into sobran from public.songs
   where status = 'published' and id in ('alfarero', 'estamos-de-fiesta-con-jesus', 'pescador-de-hombres', 'te-presentamos-el-vino-y-el-pan-ii');
  if sobran > 0 then
    raise exception 'Quedan % canciones que debían salir del cancionero', sobran;
  end if;

  -- …y ninguna se perdió por el camino: su historial sigue teniendo dueño.
  select count(*) into sobran from public.songs
   where status = 'hidden' and id in ('alfarero', 'estamos-de-fiesta-con-jesus', 'pescador-de-hombres', 'te-presentamos-el-vino-y-el-pan-ii');
  if sobran <> 4 then
    raise exception 'Deberían estar ocultas las 4 y lo están %', sobran;
  end if;

  -- Nada quedó apuntando al vacío. No se borró ninguna fila, así que esto
  -- debería ser imposible; se comprueba igual, que es de lo que se trata.
  select count(*) into sobran from public.song_versions v
   where not exists (select 1 from public.songs s where s.id = v.song_id);
  if sobran > 0 then
    raise exception 'Hay % versiones sin su canción', sobran;
  end if;

  select count(*) into sobran from public.song_submissions e
   where (e.target_song_id is not null
          and not exists (select 1 from public.songs s where s.id = e.target_song_id))
      or (e.published_song_id is not null
          and not exists (select 1 from public.songs s where s.id = e.published_song_id));
  if sobran > 0 then
    raise exception 'Hay % propuestas apuntando a una canción que no existe', sobran;
  end if;

  -- Ninguna categoría retirada sigue clasificando nada en el cancionero.
  select count(*) into sobran from public.songs
   where status = 'published'
     and categories && array['Paz', 'Jornadas', 'María', 'Otros']::text[];
  if sobran > 0 then
    raise exception 'Quedan % canciones con una categoría retirada', sobran;
  end if;

  -- Y ninguna se queda sin tiempo litúrgico.
  select count(*) into sobran from public.songs
   where status = 'published'
     and (liturgical_seasons is null or cardinality(liturgical_seasons) = 0);
  if sobran > 0 then
    raise exception 'Quedan % canciones sin tiempo litúrgico', sobran;
  end if;
end $$;

commit;
