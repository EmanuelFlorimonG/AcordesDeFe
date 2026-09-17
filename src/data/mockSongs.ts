import type { Song } from '../types/song';

export const MOCK_SONGS: Song[] = [
  {
    id: 'huracan-hakuna',
    title: 'Huracán',
    artist: 'Hakuna Group Music',
    youtubeId: 'P2Kf8RsxuiA',
    originalKey: 'G',
    recommendedCapo: 5,
    timeSignature: '4/4',
    tempo: 78,
    categories: ['Adoración', 'Hakuna', 'Jornadas'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: ['Eucaristía', 'Espíritu Santo', 'Favoritas', 'Hakuna'],
    chordsUsed: ['G', 'D', 'Em', 'C'],
    difficulty: 'Intermedio',
    year: '2020',
    content: `[Intro]
[G]  [D]  [Em]  [C]
[G]  [D]  [Em]  [C]

[Primera Parte]

[G]Me he hecho tantas [D]preguntas
[Em]Intentando [C]entender
[G]Me he lanzado a [D]buscarte
[Em]Sin saberte [C]ver

[G]Me asomaba al [D]abismo
[Em]Me he atrevido [C]saltar
[G]Y [D]ca[Em]er

[Estribillo]

[G]Y un huracán
[D]Romperá el cielo [Em]desde mi [C]garganta
[G]Gritándote
[D]¿Dónde estás cuando me haces [C]falta?

[Primera Parte]

[G]Y me han dado [D]respuestas
[Em]Pero no sé qué [C]hacer
[G]He prometido [D]seguirte
[Em]Sin [C]entender

[G]Y hay un eco en lo [D]hondo
[Em]Que me empuja [C]hacia ti
[G]Y aunque sea sin [D]sentirte
[Em]Te [C]buscaré

[Estribillo]

[G]Y un huracán
[D]Romperá el cielo [Em]desde mi [C]garganta
[G]Gritándote
[D]¿Dónde estás cuando me haces [C]falta?

[Segunda Parte]

[G]Estoy aquí, en el [D]silencio
[Em]Estoy aquí, en este [C]viento
[G]Estoy aquí, soy este [D]trozo de [C]pan
[G]Estoy aquí, en tu [D]lamento
[Em]Estoy aquí, en este [C]eco
[G]Estoy aquí, soy este [D]trozo de [C]pan

[Estribillo]

[G]Y un huracán
[D]Romperá el cielo [Em]desde mi [C]garganta
[G]Gritándote
[D]¿Dónde estás cuando me haces [C]falta?

[G]Estoy aquí
(Y un huracán)
[D]Estoy [Em]aquí[C]
(Romperá el cielo desde mi garganta)
[G]Estoy aquí
(Gritándote)
[D]Soy este trozo de [C]pan
(¿Dónde estás cuando me haces falta?)

[G]Y tu huracán
[D]Romperá el cielo [Em]desde mi [C]garganta
[G]Gritándome
[D]Cuánto me haces [C]falta`
  },
  {
    id: 'nadie-te-ama-como-yo',
    title: 'Nadie Te Ama Como Yo',
    artist: 'Martín Valverde',
    youtubeId: 'fvNj49Vwdeg',
    originalKey: 'C',
    recommendedCapo: 0,
    timeSignature: '4/4',
    tempo: 68,
    categories: ['Adoración', 'Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: ['Clásico', 'Amor de Dios', 'Cruz', 'Favoritas'],
    chordsUsed: ['C', 'G/B', 'Am', 'F', 'Dm', 'G', 'Em'],
    difficulty: 'Fácil',
    year: '1991',
    content: `[Intro]
[C]  [G/B]  [Am]  [F]  [G]

[Verso 1]
[C]  Cuánto he espe[G/B]rado este mo[Am]mento,
[F]  cuánto he espe[Dm]rado que estuvieras a[G]sí.
[C]  Cuánto he espe[G/B]rado que me ha[Am]blaras,
[F]  cuánto he espe[Dm]rado que vinieras a [G]mí.

[Verso 2]
[C]  Yo sé bien lo [G/B]que has vi[Am]vido,
[F]  sé también por [Dm]qué has llo[G]rado.
[C]  Yo sé bien lo [G/B]que has su[Am]frido,
[F]  pues de tu lado no me he [G]ido.

[Coro]
Pues nadie te [C]ama como [G/B]yo,
pues nadie te [Am]ama como [Em]yo.
Mira a la [F]cruz, esa es mi más grande [Dm]prueba:
nadie te [G]ama como yo.

Pues nadie te [C]ama como [G/B]yo,
pues nadie te [Am]ama como [Em]yo.
Mira a la [F]cruz, fue por ti, fue porque te [Dm]amo:
nadie te [G]ama como [C]yo.

[Verso 3]
[C]  Yo sé bien lo [G/B]que me [Am]dices,
[F]  aunque a veces no me [Dm]hablas. [G]
[C]  Yo sé bien lo [G/B]que en ti [Am]sientes,
[F]  aunque nunca lo com[G]partas.

[Coro]
Pues nadie te [C]ama como [G/B]yo,
pues nadie te [Am]ama como [Em]yo.
Mira a la [F]cruz, esa es mi más grande [Dm]prueba:
nadie te [G]ama como yo.

Pues nadie te [C]ama como [G/B]yo,
pues nadie te [Am]ama como [Em]yo.
Mira a la [F]cruz, fue por ti, fue porque te [Dm]amo:
nadie te [G]ama como [C]yo.

[Outro]
[F]  [G]  [C]`
  },
  {
    id: 'sencillamente-dios',
    title: 'Sencillamente Dios',
    artist: 'Hakuna Group Music',
    originalKey: 'D',
    recommendedCapo: 2,
    timeSignature: '3/4',
    tempo: 92,
    categories: ['Adoración', 'Hakuna'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: ['Silencio', 'Eucaristía', 'Hakuna'],
    chordsUsed: ['D', 'A/C#', 'Bm', 'G', 'A', 'Em', 'F#m'],
    difficulty: 'Intermedio',
    year: '2019',
    content: `[Intro]
[D]  [A/C#]  [Bm]  [G]

[Verso 1]
[D]  Que no hacen falta más pa[A/C#]labras,
[Bm]  que con mirarte ya me [G]basta.
[D]  Que en el silencio de este [A/C#]sagrario
[Bm]  se calma toda mi nos[G]talgia.

[Pre-Coro]
[Em]  Tú estás aquí escondido en el [F#m]pan,
[G]  haciéndote frágil para encon[A]trar mi paz.

[Coro]
Sencillamente [D]Dios,
tan humilde y tan [A/C#]cerca.
Sencillamente a[Bm]mor,
que rompe mis con[G]tratiempos.
Quédate en mi [D]pecho y no me dejes [A]más,
[G]  que vivir contigo es la eter[A]nidad.

[Verso 2]
[D]  En la rutina de mis [A/C#]horas,
[Bm]  a veces pierdo la pi[G]sada.
[D]  Pero vuelvo a tu pre[A/C#]sencia,
[Bm]  y tu mirada me res[G]cata.

[Coro]
Sencillamente [D]Dios,
tan humilde y tan [A/C#]cerca.
Sencillamente a[Bm]mor,
que rompe mis con[G]tratiempos.
Quédate en mi [D]pecho y no me dejes [A]más,
[G]  que vivir contigo es la eter[A]nidad.

[Outro]
[D]  [A/C#]  [Bm]  [G]  [D]`
  },
  {
    id: 'contigo-maria',
    title: 'Contigo María',
    artist: 'Athenas',
    youtubeId: 'kkVtd-kam6A',
    originalKey: 'G',
    recommendedCapo: 0,
    timeSignature: '4/4',
    tempo: 72,
    categories: ['María', 'Adoración'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: ['Virgen María', 'Madre', 'Devoción', 'Favoritas'],
    chordsUsed: ['G', 'D/F#', 'Em', 'C', 'D', 'Am7', 'G/B'],
    difficulty: 'Fácil',
    year: '2018',
    content: `[Intro]
[G]  [D/F#]  [Em]  [C]

[Verso 1]
[G]  Quiero caminar con[D/F#]tigo María,
[Em]  madre en el dolor y en la a[C]legría.
[G]  Tú que pronunciaste un [D/F#]sí valiente,
[Em]  guíame al Señor eter[C]namente.

[Pre-Coro]
[Am7]  Toma de mi mano y en[G/B]séñame a orar,
[C]  haz que mi vida sea un [D]canto de paz.

[Coro]
Con[G]tigo María, camino en la [D/F#]fe,
con[Em]tigo confío, en ti espera[C]ré.
Regá[G]lame el gozo de ser como [D/F#]Tú,
lle[Em]vando a la gente la luz de [C]Jesús.

[Verso 2]
[G]  En las noches de du[D/F#]das y viento,
[Em]  sé mi dulce manto y con[C]suelo.
[G]  Como hiciste en Caná aquel [D/F#]día,
[Em]  haz que no nos falte la a[C]legría.

[Coro]
Con[G]tigo María, camino en la [D/F#]fe,
con[Em]tigo confío, en ti espera[C]ré.
Regá[G]lame el gozo de ser como [D/F#]Tú,
lle[Em]vando a la gente la luz de [C]Jesús.

[Outro]
[C]  Luz de Je[D]sús...
[G]  [D/F#]  [Em]  [C]  [G]`
  },
  {
    id: 'alfarero',
    title: 'Alfarero',
    artist: 'Alfareros',
    // 👉 PEGA AQUÍ el id real de YouTube (lo que va después de "v=" en la URL del video). Ejemplo: 'dQw4w9WgXcQ'
    youtubeId: '',
    originalKey: 'D',
    recommendedCapo: 0,
    timeSignature: '4/4',
    tempo: 80,
    categories: ['Adoración', 'Jornadas'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: ['Entrega', 'Espíritu', 'Comunidad'],
    chordsUsed: ['D', 'A', 'Bm', 'G', 'Em', 'A7'],
    difficulty: 'Fácil',
    year: '2011',
    content: `[Intro]
[D]  [A]  [Bm]  [G]

[Verso 1]
[D]  Gira que gira, [A]rueda que rueda,
[Bm]  siento tus manos [G]sobre mi greda.
[D]  Tú me modelas [A]a tu manera,
[Bm]  quitas las piedras [G]que me lastiman.

[Pre-Coro]
[Em]  No me resisto al calor de tu [A]fuego,
[Em]  haz de mi vida un vaso [A7]nuevo.

[Coro]
[D]  Tú eres el alfa[A]rero, yo soy la ar[Bm]cilla,
moldea mi [G]vida, Señor de ma[D]ravillas.
Quebranta mi or[A]gullo, transfórmame en [Bm]amor,
que viva sólo [G]para tu gloria, Se[D]ñor.

[Verso 2]
[D]  A veces duele [A]cuando me pules,
[Bm]  pero confío en [G]tu obra sublime.
[D]  Eres el artista [A]de la creación,
[Bm]  que escribe versos [G]en mi corazón.

[Coro]
[D]  Tú eres el alfa[A]rero, yo soy la ar[Bm]cilla,
moldea mi [G]vida, Señor de ma[D]ravillas.
Quebranta mi or[A]gullo, transfórmame en [Bm]amor,
que viva sólo [G]para tu gloria, Se[D]ñor.

[Outro]
[D]  [A]  [Bm]  [G]  [D]`
  },
  {
    id: 'digno-de-alabar',
    title: 'Digno de Alabar',
    artist: 'Athenas',
    youtubeId: '3SgFCoRwP4A',
    originalKey: 'A',
    recommendedCapo: 2,
    timeSignature: '4/4',
    tempo: 120,
    categories: ['Alabanza', 'Jornadas'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: ['Júbilo', 'Fuerza', 'Animación'],
    chordsUsed: ['A', 'E', 'F#m', 'D', 'Bm', 'Esus4'],
    difficulty: 'Fácil',
    year: '2021',
    content: `[Intro]
[A]  [E]  [F#m]  [D]

[Verso 1]
[A]  Levanto mis manos hoy hacia el cielo,
[E]  proclamo que sólo Tú eres bueno.
[F#m]  No hay otro nombre que traiga victoria,
[D]  llenaste mi vida de gracia y de gloria.

[Coro]
[A]  ¡Digno, sólo Tú eres [E]digno!
Digno de ala[F#m]bar, digno de ado[D]rar.
[A]  Santo, sólo Tú eres [E]santo,
mi roca y mi can[F#m]ción por la eterni[D]dad.

[Verso 2]
[A]  Rompiste las cadenas que me ataban,
[E]  pusiste en mis labios dulce alabanza.
[F#m]  Danzamos alegres en tu presencia,
[D]  cantamos al Dios de toda grandeza.

[Coro]
[A]  ¡Digno, sólo Tú eres [E]digno!
Digno de ala[F#m]bar, digno de ado[D]rar.
[A]  Santo, sólo Tú eres [E]santo,
mi roca y mi can[F#m]ción por la eterni[D]dad.

[Puente]
[Bm]  Que toda rodilla se doble [F#m]ante Ti,
[D]  que todos los pueblos te adoren a [Esus4]Ti. [E]

[Coro]
[A]  ¡Digno, sólo Tú eres [E]digno!
Digno de ala[F#m]bar, digno de ado[D]rar.
[A]  Santo, sólo Tú eres [E]santo,
mi roca y mi can[F#m]ción por la eterni[D]dad.

[Outro]
[A]  [E]  [F#m]  [D]  [A]`
  },
  {
    id: 'pescador-de-hombres',
    title: 'Pescador de Hombres',
    artist: 'Cesáreo Gabaráin',
    youtubeId: 'm0WwrQsCiN0',
    originalKey: 'D',
    recommendedCapo: 0,
    timeSignature: '4/4',
    tempo: 75,
    categories: ['Comunión', 'Jornadas'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: ['Misión', 'Vocación', 'Clásico'],
    chordsUsed: ['D', 'A', 'Bm', 'G', 'A7'],
    difficulty: 'Fácil',
    year: '1979',
    content: `[Intro]
[D]  [A]  [Bm]  [G]  [A]

[Verso 1]
[D]  Tú has venido a la [A]orilla,
[Bm]  no has buscado ni a [G]sabios ni a ricos,
[D]  tan sólo quieres [A]que yo te [D]siga. [A7]

[Coro]
[D]  Señor, me has mirado a los [A]ojos,
[G]  sonriendo has dicho mi [D]nombre.
[D]  En la arena he dejado mi [A]barca,
[G]  junto a Ti busca[A]ré otro [D]mar.

[Verso 2]
[D]  Tú sabes bien lo que [A]tengo:
[Bm]  en mi barca no hay [G]oro ni espadas,
[D]  tan sólo redes [A]y mi tra[D]bajo. [A7]

[Coro]
[D]  Señor, me has mirado a los [A]ojos,
[G]  sonriendo has dicho mi [D]nombre.
[D]  En la arena he dejado mi [A]barca,
[G]  junto a Ti busca[A]ré otro [D]mar.

[Verso 3]
[D]  Tú necesitas mis [A]manos,
[Bm]  mi cansancio que a [G]otros descanse,
[D]  amor que quiera [A]seguir a[D]mando. [A7]

[Coro]
[D]  Señor, me has mirado a los [A]ojos,
[G]  sonriendo has dicho mi [D]nombre.
[D]  En la arena he dejado mi [A]barca,
[G]  junto a Ti busca[A]ré otro [D]mar.

[Outro]
[G]  [A]  [D]`
  },
  {
    id: 'forajidos-hakuna',
    title: 'Forajidos',
    artist: 'Hakuna Group Music',
    originalKey: 'Em',
    recommendedCapo: 0,
    timeSignature: '4/4',
    tempo: 104,
    categories: ['Hakuna', 'Jornadas'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: ['Revolución', 'Amistad', 'Juventud', 'Hakuna'],
    chordsUsed: ['Em', 'C', 'G', 'D', 'Am', 'B7'],
    difficulty: 'Intermedio',
    year: '2022',
    content: `[Intro]
[Em]  [C]  [G]  [D]

[Verso 1]
[Em]  Somos forajidos bus[C]cando la verdad,
[G]  rompiendo las cadenas [D]en la tempestad.
[Em]  No nos conformamos con [C]este mundo gris,
[G]  queremos prender fuego y [D]aprender a vivir.

[Pre-Coro]
[Am]  Miramos hacia arriba, la [Em]meta no es el suelo,
[C]  hemos nacido para conquis[B7]tar el cielo.

[Coro]
[Em]  Forajidos de amor, [C]locos de Dios,
[G]  cantando a pleno pulmón [D]con una sola voz.
[Em]  Que el mundo despierte, que [C]arda la ciudad,
[G]  la locura de la cruz es [D]nuestra libertad.

[Verso 2]
[Em]  Caminamos juntos, her[C]manos en la sed,
[G]  donde otros ven ruinas [D]nosotros vemos fe.
[Em]  No tememos a la noche ni [C]al frío del dolor,
[G]  porque en cada herida flore[D]ce su perdón.

[Coro]
[Em]  Forajidos de amor, [C]locos de Dios,
[G]  cantando a pleno pulmón [D]con una sola voz.
[Em]  Que el mundo despierte, que [C]arda la ciudad,
[G]  la locura de la cruz es [D]nuestra libertad.

[Outro]
[Em]  [C]  [G]  [D]  [Em]`
  },
  {
    id: 'en-medio-del-fuego',
    title: 'En Medio del Fuego',
    artist: 'Hakuna Group Music',
    originalKey: 'B',
    categories: ['Hakuna'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: ['G#m', 'E', 'B', 'F#'],
    content: `[Estribillo]
[G#m]Alzo la voz
En medio del [E]fuego
De pie en el do[B]lor
Sin miedo te es[F#]pero

[G#m]Alzo la voz
En medio del [E]fuego
De pie en el do[B]lor
Sin miedo te es[F#]pero

[Puente]
[G#m]Ahora que no hay [B]tierra que pi[E]sar
[G#m]Aunque todo en mí [B]me pida aban[E]donar

[Estribillo]
[B]Alzo la voz
En medio del [E]fuego
De pie en el do[G#m]lor
Sin miedo te es[F#]pero

[B]Alzo la voz
En medio del [E]fuego
De pie en el do[G#m]lor
Sin miedo te es[F#]pero

[Verso 1]
[G#m]Cielos, ejércitos
Luz y tinieblas
La [E]noche y el día
El Sol, las estrellas, can[B]tad
Bendecid al Se[F#]ñor

[Verso 2]
[G#m]Que rompan los mares
Los ríos que corran
Que na[E]den los peces
Retumben las olas, can[B]tad
Bendecid al Se[F#]ñor

[Verso 3]
[G#m]Los montes y cumbres
Los fríos y heladas
Gana[E]dos y fieras
Las aves y plantas, can[B]tad
Bendecid al Se[F#]ñor

[Verso 4]
[G#m]Hijos de hombres
Que rían y lloren
Que a[E]bracen
Que corran
Que griten y adoren, can[B]tad
Bendecid al Se[F#]ñor

[Estribillo]
[G#m]Alzo la voz
En medio del [E]fuego
De pie en el do[B]lor
Sin miedo te es[F#]pero

[B]Alzo la voz
En medio del [E]fuego
De pie en el do[G#m]lor
Sin miedo te es[F#]pero

[Final]
[B]Alzo la voz (alzo la voz)
En medio del [E]fuego (en medio del fuego)
De pie en el do[G#m]lor (de pie en el dolor)
Sin miedo te es[F#]pero (sin miedo te espero)

[B]Alzo la voz (alzo la voz)
En medio del [E]fuego (en medio del fuego)
De pie en el do[G#m]lor
Sin miedo te es[F#]pero`
  },
  {
    id: 'un-segundo',
    title: 'Un Segundo',
    artist: 'Hakuna Group Music',
    originalKey: 'Em',
    recommendedCapo: 1,
    categories: ['Hakuna'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: ['G', 'C', 'Cm', 'D', 'Em', 'D7', 'B7'],
    content: `[Intro]
[G]

[Verso]
Si por [G]un segundo vieras cómo te [C]miro
Cuando [Cm]duermes, cierras los ojos, yo
Ahí [G]sigo
[D]Se me cae la baba, impo[G]sible no mi[Em]rar
No [C]quiero dejar de hacerlo, no lo
In[D]tentes imaginar

[Verso]
Si por [G]un segundo vieras cómo te
Es[C]cucho
Cada [Cm]ruido, cada palabra, y cuando no
Hablas [G]mucho
Y [D]hables o estés callado, sólo [G]me
Importa si es[Em]tás
En mi a[C]mor cabe el silencio, cabe
Ha[D]blar y mucho [D7]más

[Estribillo]
Re[G]viento de amor, estoy tem[C]blando de
Gozo
Te [D]como con la mirada, estás aquí [B7]y no
Es[Em]tás solo
Cada [G]lágrima, cada risa, en mi memo[C]ria
Se han grabado
Cada de[D]talle de tu cuerpo y de tu [B7]alma
Fueron pen[Em]sados
No [G]creo que aguante más conte[C]nerme aquí
De[D]trás
Quiero en[D]trar, hacerte mío, curar tu
He[G]rida si me la [Em]das
Si por [C]un segundo vieras cómo te [D]miro
No querrías ver nada [G]más

[Verso]
Si por [G]un segundo vieras cuánto te [C]amo
Yo [Cm]solo sé entregarme, [G]aunque sea en
[Em]Vano
Y [D]tiemblo al imaginar cuando lle[G]gues al
[Em]Cielo
Costa[C]rá respirar en el a[D]brazo que nos
Daremos

[Verso]
Si por [G]un segundo vieras lo que [C]hay por
Llegar
Lo que a[Cm]guarda escondido, casuali[G]dades
Sin a[Em]zar
Lo [D]sueño tantas veces, en cada [G]don
¿Qué puedo ha[Em]cer?
Tú re[C]cibes mi regalo, al cielo mi[D]ras
Agrade[D7]ce

[Estribillo]
Re[G]viento de amor, estoy tem[C]blando de
Gozo
Te [D]como con la mirada, estás aquí [B7]y no
Estás [Em]solo
Cada [G]lágrima, cada risa, en mi memo[C]ria
Se han grabado
Cada de[D]talle de tu cuerpo y de tu [B7]alma
Fueron pen[Em]sados
No [G]creo que aguante más conte[C]nerme aquí
De[D]trás
Quiero en[D]trar, hacerte mío, curar tu
He[G]rida si me la [Em]das
Si por [C]un segundo vieras cómo te [D]miro
No querrías ver nada [G]más

[G]  [C]  [D7]

[Estribillo]
Re[G]viento de amor, estoy tem[C]blando de
Gozo
[D]Hay tanta locura en este amor [B7]que no
Con[Em]trolo
[G]Pierde tu vida, recibi[C]rás la eternidad
La ale[D]gría de ser esclavo, esclavo [G]de
Mi liber[Em]tad
Si por [C]un segundo vieras cómo te [D]miro
No querrías ver nada [G]más`
  },
{
    id: 'vienen-con-alegria',
    title: 'Vienen con Alegría',
    categories: ['Entrada'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Coro:
Vienen con alegría, Señor
Cantando vienen con alegría, Señor
//Los que caminan por la vida, Señor
Sembrando tu paz y amor//

Vienen trayendo la esperanza
A un mundo cargado de ansiedad
A un mundo que busca y que no alcanza
Caminos de amor y de amistad

(Se repite el coro tantas veces sea necesario)`
  },
  {
    id: 'bendecire-al-senor',
    title: 'Bendeciré al Señor',
    originalKey: 'C',
    categories: ['Entrada'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Coro:
Bendeciré al Señor, con toda mi alma, con toda mi alma, bendeciré al Señor.
Bendeciré al Señor, por todos los siglos, por todos los siglos, bendeciré al Señor.

Él es quien perdona todas mis maldades.
Él que siempre sana mis enfermedades.
Él es quien nos colma de amor.

Coro

Él es quien nos llena de sabiduría.
Él que nos anima a vivir en armonía.
Él escucha nuestra voz.

Coro`
  },
  {
    id: 'fiesta-de-fe',
    title: 'Fiesta de Fe',
    categories: ['Entrada'],
    liturgicalSeasons: ['adviento', 'navidad', 'tiempo-ordinario', 'pascua'],
    tags: [],
    chordsUsed: [],
    content: `Coro:
//Fiesta, fiesta, fiesta de fe
Fiesta, fiesta, fiesta de amor//
//Aleluya, cantaremos,
Es la misa un gran encuentro con Jesús//

Coro`
  },
  {
    id: 'somos-un-pueblo-que-camina',
    title: 'Somos un Pueblo que Camina',
    categories: ['Entrada'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Coro:
Somos un pueblo que camina
y juntos caminando
podremos alcanzar
//otra ciudad que no se acaba
sin penas ni tristezas
ciudad de eternidad.//
Somos un pueblo que camina
que marcha por el mundo
buscando otra ciudad.

Somos errantes peregrinos
en busca de un destino
destino de unidad.
Siempre seremos caminantes
pues sólo caminando
podremos alcanzar
//otra ciudad que no se acaba
sin penas ni tristezas
ciudad de eternidad.//`
  },
  {
    id: 'estamos-de-fiesta-con-jesus',
    title: 'Estamos de Fiesta con Jesús',
    categories: ['Entrada'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Estamos de fiesta con Jesús,
al cielo queremos ir,
estamos reunidos en la mesa,
y es Cristo quien va a servir.

Coro:
Poderoso es nuestro Dios (x4)
Él sana, Él salva, poderoso es nuestro Dios.

Su amor nos demuestra por doquier,
nos llena con su amistad,
su pan y su vino nos regala,
Él mismo se nos dará.

Coro`
  },
  {
    id: 'abba-padre-venga-tu-reino',
    title: 'Abba Padre Venga tu Reino',
    categories: ['Entrada'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `El Señor, el Señor ya está aquí
Derramando su amor sobre ti

Coro:
//Y cantemos para Él
Y entonemos a una voz//
//Abba Padre, venga tu Reino (x2)//

Deja toda tristeza y dolor
Y levanta tus brazos a Dios

Coro`
  },
  {
    id: 'ven-senor-no-tardes',
    title: 'Ven Señor no Tardes',
    categories: ['Entrada'],
    liturgicalSeasons: ['adviento'],
    tags: [],
    chordsUsed: [],
    content: `Coro:
Ven, ven Señor no tardes
Ven, ven que te esperamos
Ven, ven Señor no tardes
Ven pronto Señor

El mundo muere de frío
El alma perdió el calor
Los hombres no son hermanos
El mundo no tiene amor

Coro
Envuelto en sombría noche
El mundo sin paz no ve
Buscando va una esperanza
Buscando, Señor, tu fe

Coro
Al mundo le falta vida
Al mundo le falta luz
Al mundo le falta el cielo
Al mundo le faltas Tú

Coro
Desead la paz a Jerusalén:
"Vivan seguros los que te aman,
haya paz dentro de tus muros,
en tus palacios de seguridad".

Coro
Por mis hermanos y compañeros,
voy a decir: "La paz contigo"
Por la casa del Señor, nuestro Dios,
te deseo todo bien.

Coro`
  },
  {
    id: 'que-alegria-cuando-me-dijeron',
    title: 'Qué Alegría Cuando me Dijeron',
    categories: ['Entrada'],
    tags: [],
    chordsUsed: [],
    content: `Coro:
¡Qué alegría cuando me dijeron:
"Vamos a la casa del Señor"!
Ya están pisando nuestros pies
tus umbrales, Jerusalén.

Jerusalén está fundada
como ciudad bien compacta.
Allá suben las tribus,
las tribus del Señor.

Coro
Según la costumbre de Israel
a celebrar el nombre del Señor;
en ella están los tribunales de Justicia,
en el palacio de David.

Coro
El pueblo en Él, vida encontró, la esclavitud ya terminó.
Alegría y paz hermano, que el Señor resucitó.
la luz de Dios, en Él brilló, la nueva vida nos llenó.
Alegría y paz hermano, que el Señor resucitó.`
  },
  {
    id: 'hoy-el-senor-resucito',
    title: 'Hoy el Señor Resucitó',
    categories: ['Entrada'],
    liturgicalSeasons: ['pascua'],
    tags: [],
    chordsUsed: [],
    content: `Hoy el Señor resucitó y de la muerte nos salvó.
Alegría y paz hermano, que el Señor resucitó.
Porque espero, Dios le libró y de la muerte lo sacó.
Alegría y paz hermano, que el Señor resucitó.

Reunidos en el nombre del Señor
Reunidos en el nombre del Señor
Que nos ha congregado ante su altar
Celebremos el misterio de la Fe
Bajo el signo del amor y la Unidad

Celebremos el misterio de la Fe
Bajo el signo del amor y la Unidad...`
  },
  {
    id: 'hoy-perdoname',
    title: 'Hoy Perdóname',
    categories: ['Piedad'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Hoy, perdóname
Hoy, por siempre
Sin mirar la mentira, el vacío de nuestras vidas
Nuestras faltas de amor y caridad

Hoy, perdóname
Hoy, por siempre
Aun sabiendo que he caído
Que de ti siempre había huido
Hoy, regreso arrepentido
Vuelvo a ti (x4)`
  },
  {
    id: 'ten-piedad',
    title: 'Ten Piedad',
    categories: ['Piedad'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `//Ten piedad, Señor, ten piedad,
soy pecador, ten piedad//

//Y de mí, Cristo apiádate,
contra ti yo pequé//

//Ten piedad, Señor, ten piedad,
soy pecador, ten piedad//`
  },
  {
    id: 'piedad-don-martin',
    title: 'Piedad Don Martín',
    originalKey: 'C',
    categories: ['Piedad'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Señor ten piedad de nosotros, ohhh Señor
Señor ten piedad de nosotros ten piedad. (Bis)
Cristo ten piedad de nosotros, ohhh Señor...
Señor ten piedad de nosotros, ohhh Señor...`
  },
  {
    id: 'piedad-via-raisa',
    title: 'Piedad Via Raisa',
    categories: ['Piedad'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Señor ten piedad de nosotros (solista)
Señor ten piedad de nosotros (coro)
Cristo ten piedad de nosotros (solista)
Cristo ten piedad de nosotros (coro)
Señor ten piedad de nosotros (solista)
Señor ten piedad de nosotros (coro)`
  },
  {
    id: 'jessed',
    title: 'Jessed',
    categories: ['Gloria'],
    liturgicalSeasons: ['navidad', 'tiempo-ordinario', 'pascua'],
    tags: [],
    chordsUsed: [],
    content: `Coro:
//Gloria, a Dios en el cielo
y en la tierra a los hombres paz//

Te alabamos,
te bendecimos,
te adoramos,
te glorificamos.
Te damos gracias por tu inmensa Gloria.
Señor, Dios rey Celestial

Padre Todo poderoso,
Señor hijo único Jesucristo,
Señor Dios cordero de Dios,
hijo del Padre.

Tú que quitas el pecado del mundo, ten piedad de nosotros.
Tú que quitas el pecado del mundo, atiende a nuestra súplica.
Tú que estás a la derecha del Padre, ten piedad de nosotros.

Porque solamente tú eres Santo.
Solo tú altísimo Jesucristo.
Con el Espíritu Santo en la Gloria del Padre.

Coro
Amén`
  },
  {
    id: 'trinidad',
    title: 'Trinidad',
    categories: ['Gloria'],
    liturgicalSeasons: ['navidad', 'tiempo-ordinario', 'pascua'],
    tags: [],
    chordsUsed: [],
    content: `Gloria a Dios, Gloria a Dios, Gloria al Padre,
a Él que sea la gloria,
//aleluya amén.//
Gloria a Dios, Gloria a Dios, Gloria al Hijo
a Él que sea la Gloria,
//aleluya amén.//
Gloria a Dios, Gloria a Dios, Gloria Espíritu Santo
a Él que sea la Gloria,
//aleluya amén.//`
  },
  {
    id: 'gloria-a-dios-en-el-cielo-pascua',
    title: 'Gloria a Dios en el Cielo (Pascua)',
    categories: ['Gloria'],
    tags: [],
    chordsUsed: [],
    content: `Gloria, Gloria a Dios en el cielo, y en la tierra paz a los hombres que ama el Señor (Bis)

Por tu inmensa Gloria Te alabamos, glorificamos, te bendecimos y te adoramos, te damos gracias Señor, te damos gracias Señor. Té damos gracias, Señor Té, damos gracias Señor

Señor, Dios Rey celestial, Dios Padre todo poderoso, Jesucristo, Único Hijo, Señor Dios cordero de Dios, hijo del Padre.

Tú que estás sentado a la diestra, ten piedad de nosotros. Tú que quitas el pecado del mundo, nuestras súplicas atiende.

Porque solo tú eres Santo. Solo tú Señor Jesucristo, con el Espíritu en la Gloria de Dios Padre. Amén, de Dios Padre, Amén. De Dios Padre, Amén. De Dios Padre, Amén.`
  },
  {
    id: 'gloria-via-raisa',
    title: 'Gloria Via Raisa',
    categories: ['Gloria'],
    liturgicalSeasons: ['navidad', 'tiempo-ordinario', 'pascua'],
    tags: [],
    chordsUsed: [],
    content: `Gloria al Señor
Que reina en el cielo
Y en la tierra Paz,
a los hombres que ama Él

Señor te alabamos,
Señor te bendecimos,
Todos te adoramos,
Gracias por tu Gloria

Tú eres el Cordero
Que quitas el pecado
Ten piedad de nosotros
Y escucha nuestra Oración

Tú solo eres Santo
Tú solo el Altísimo
Con el Espíritu Santo
En la Gloria de Dios Padre

Gloria al Señor
Que reina en el cielo
Y en la tierra Paz
A los hombres que ama Él.`
  },
  {
    id: 'gloria-a-nuestro-dios',
    title: 'Gloria a Nuestro Dios',
    originalKey: 'C',
    categories: ['Gloria'],
    liturgicalSeasons: ['navidad', 'tiempo-ordinario', 'pascua'],
    tags: [],
    chordsUsed: [],
    content: `Gloria a nuestro Dios en lo alto de los cielos
y en la tierra paz a los por Él amados.

Señor, te alabamos,
Señor, te bendecimos,
todos te adoramos,
gracias por tu inmensa gloria.

Gloria a nuestro Dios en lo alto de los cielos
y en la tierra paz a los por Él amados.

Tú eres el Cordero
que quitas el pecado,
ten piedad de nosotros
y escucha nuestra oración.

Gloria a nuestro Dios en lo alto de los cielos
y en la tierra paz a los por Él amados.

Tú solo eres Santo,
tú solo Altísimo,
con el Espíritu Santo
en la gloria de Dios Padre.

Gloria a nuestro Dios en lo alto de los cielos
y en la tierra paz a los por Él amados. (bis)`
  },
  {
    id: 'atentos-a-escuchar',
    title: 'Atentos a Escuchar',
    originalKey: 'D',
    categories: ['Aclamación'],
    liturgicalSeasons: ['adviento', 'navidad', 'tiempo-ordinario', 'pascua'],
    tags: [],
    chordsUsed: [],
    content: `Atentos a escuchar, bellas palabras de anhelos y vida.
Que el Evangelio nos diga si aceptando al hermano, es como aceptarte a Ti.
Tratemos de llevar todo el mensaje que da Jesucristo.
Pues nos indica el camino, con sus lindas palabras para todos salvar.
Aleluya, aleluya; porque aceptando al hermano es como aceptarte a Ti.
Aleluya, aleluya; con sus lindas palabras quiere a todos salvar.`
  },
  {
    id: 'su-palabra-es-la-verdad',
    title: 'Su Palabra es la Verdad',
    categories: ['Aclamación'],
    liturgicalSeasons: ['adviento', 'navidad', 'tiempo-ordinario', 'pascua'],
    tags: [],
    chordsUsed: [],
    content: `//Aleluya, Aleluya,
Su palabra es la verdad, la vida y el amor.//`
  },
  {
    id: 'el-senor-resucito-aleluya',
    title: 'El Señor Resucitó Aleluya',
    categories: ['Aclamación'],
    liturgicalSeasons: ['pascua'],
    tags: [],
    chordsUsed: [],
    content: `Aleluya Aleluya
Aleluya Aleluya
Aleluya Aleluya
El Señor resucitó (Bis)

El Señor resucitó, cantemos con alegría, demos gracias al Señor,
Aleluya (Bis)

Mi pecado redimió
Cristo Dios subiendo al cielo,
nueva vida ahora tengo,
Aleluya (Bis)`
  },
  {
    id: 'la-fiesta-del-senor',
    title: 'La Fiesta del Señor',
    categories: ['Aclamación'],
    liturgicalSeasons: ['pascua'],
    tags: [],
    chordsUsed: [],
    content: `Aleluya, Aleluya es la fiesta del Señor.
Aleluya, Aleluya, el Señor resucitó. (Bis)

Ya no hay miedo, ya no hay muerte. Ya no hay penas que llorar;
porque Cristo sigue vivo, la esperanza abierta está.

Cuando alguien te pregunte, dónde está la libertad,
que en tus obras el descubra, que Jesús es quien la da.`
  },
  {
    id: 'dichoso',
    title: 'Dichoso',
    categories: ['Aclamación'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Dichoso el que con vida intachable
Camina en la ley del Señor
Dichoso el que guardando sus preceptos
Lo busca de todo corazón

Tu palabra me da vida, confío en ti, Señor
Tu palabra es eterna
En ella esperaré`
  },
  {
    id: 'llegara-con-la-luz',
    title: 'Llegará con la Luz',
    categories: ['Aclamación'],
    tags: [],
    chordsUsed: [],
    content: `Caminamos hacia el sol esperando la verdad;
la mentira, la opresión, cuando vengas cesarán.

/ Llegará con la luz la esperada libertad.`
  },
  {
    id: 'queremos-escuchar-tu-voz',
    title: 'Queremos Escuchar tu Voz',
    originalKey: 'C',
    categories: ['Aclamación'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Queremos escuchar tu voz,
oh Jesús, oh Jesús.
Vivir tu amor en plenitud y cambiar.

Nuestra vida, nuestro ser
dando fruto de este amor,
siendo testimonio en nuestro caminar. (bis)`
  },
  {
    id: 'pongo-en-tus-manos',
    title: 'Pongo en tus Manos',
    originalKey: 'C',
    categories: ['Ofertorio'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Pongo en tus manos, las penas y el dolor.
todo el esfuerzo, el trabajo y el temor.
y pongo en tu mesa mi pobre corazón.
y vengo a decirte lo que siente mi interior.

Coro:
Y con el pan yo me ofrezco a ti,
para que en tus manos hagas lo que quieras de mí.
Y con el vino, fruto de tu amor, me pongo en tus manos, Señor.

Pongo en tus manos las dudas y el pesar.
Las inquietudes que tengo al caminar.
Tu Señor las cambiarás, en alegría y paz.
Con el vino y con el pan, las has de transformar.

Coro`
  },
  {
    id: 'te-presentamos-el-vino-y-el-pan',
    title: 'Te Presentamos el Vino y el Pan',
    categories: ['Ofertorio'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Te presentamos el vino y el pan
Como señal de que nos entregamos
Tu cuerpo y sangre quiere que comamos
Y así llenar nuestras vidas ansiosas de ti

Te presentamos el vino y el pan
Hechos de frutas y trigo maduro
Esta es la ofrenda que te presentamos
Que ser cuerpo y sangre de ti, oh Señor.

Coro:
//Pan y Vino, Pan y Vino
Tu cuerpo y sangre que hoy ofrecemos.
Pan y Vino, Pan y Vino
Que compartimos a cada momento//

Te presentamos el vino y el pan
Para que tu lo bendigas y partas
Y así con fe comulguemos con ellos
Y así llenar nuestras vidas, oh Señor.

Coro`
  },
  {
    id: 'hemos-entregado',
    title: 'Hemos Entregado',
    categories: ['Ofertorio'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Hemos entregado nuestras vidas al Señor
No hay mayor bendición que ser de Él
Hemos entregado nuestras vidas al Señor
Y Él ahora nos da su vida eterna

Bendito seas Señor por este pan
Fruto de la tierra y del trabajo del hombre
Bendito seas Señor por este vino
Que hemos recibido de tu amor y bondad

Y ahora Señor te presentamos el pan
Y el vino que tú convertirás
En cuerpo y sangre de tu hijo Jesús
Pan de vida y bebida de salvación

Bendito seas Señor por este pan
Fruto de la tierra y del trabajo del hombre
Bendito seas Señor por este vino
Que hemos recibido de tu amor y bondad`
  },
  {
    id: 'te-ofrecemos-nuestra-juventud',
    title: 'Te Ofrecemos Nuestra Juventud',
    originalKey: 'D',
    categories: ['Ofertorio'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Este día que amanece entre cantos y alegrías,
este día en que sentimos tu presencia en nuestras vidas.

Estribillo:
Ilusiones y esperanzas la alegría de vivir,
todos juntos como hermanos caminando hacia Ti.

Estribillo
El esfuerzo de los hombres, el dominio de la tierra,
la llegada de tu Reino, inquietud que se hace eterna.

Estribillo
Ofrecemos todos juntos nuestras vidas al Señor,
los trabajos y dolores, la alegría y el amor.

Estribillo`
  },
  {
    id: 'en-su-mesa-hay-amor',
    title: 'En su Mesa Hay Amor',
    categories: ['Ofertorio'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `El Señor nos ha reunido junto a Él
El Señor nos ha invitado a estar con Él
En su mesa hay amor
La promesa del perdón
y en el vino y pan su corazón (bis)

Cuando, Señor, tu voz
llega en silencio a mí
y mis hermanos me hablan de ti
sé que a mi lado estás
te sientas junto a mí
acoges mi vida y mi oración`
  },
  {
    id: 'hoy-senor-te-ofrecemos',
    title: 'Hoy Señor te Ofrecemos',
    categories: ['Ofertorio'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Hoy Señor te ofrecemos nuestro anhelo
y nuestro afán, de servirte cada día en
ofrenda y hermandad.

Recibe oh Dios, nuestras vidas, recibe
oh Dios nuestra voluntad,
Que ofrecemos con amor, que
llevamos en verdad, te venimos a ofrendar.

Pan y Vino, Pan y Vino, la pobreza y humildad,
Pan y Vino, Pan y Vino, que son
signos del amor, que tú nos das.

A tu voz de fiel amigo, en confianza y
en virtud, con certeza respondimos,
para servir a Jesús.

Recibe oh Dios nuestras vidas, recibe
oh Dios nuestra voluntad
Que ofrecemos con amor, que
llevamos en verdad, te venimos a ofrendar.`
  },
  {
    id: 'te-presentamos-el-vino-y-el-pan-ii',
    title: 'Te Presentamos el Vino y el Pan (II)',
    categories: ['Ofertorio'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Te presentamos el vino y el pan
Te presentamos el vino y el pan
Como señal de que nos entregamos
Tu cuerpo y sangre quiere que comamos
Y así llenar nuestras vidas ansiosas de ti

Te presentamos el vino y el pan
Hechos de frutas y trigo maduro
Esta es la ofrenda que te presentamos
Que ser cuerpo y sangre de ti, oh Señor.

Coro:
//Pan y Vino, Pan y Vino
Tu cuerpo y sangre que hoy ofrecemos.
Pan y Vino, Pan y Vino
Que compartimos a cada momento//

Te presentamos el vino y el pan
Para que tu lo bendigas y partas
Y así con fe comulguemos con ellos
Y así llenar nuestras vidas, oh Señor.`
  },
  {
    id: 'este-pan-y-vino',
    title: 'Este Pan y Vino',
    categories: ['Ofertorio'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Este pan y vino
Que hoy te presentamos
Pongo en tus manos, Señor.
Tú me has perdonado
Todos mis pecados
Por tu sacrificio, Señor.

Coro:
Te doy, todo lo que soy
En tus manos mi Señor
Pongo todo mi temor y dolor

Te doy, gracias Padre bueno
Hoy me entrego por completo
Toma mi vida oh mi Dios, mi Salvador

Final suave:
Este pan y vino...`
  },
  {
    id: 'santo-swing',
    title: 'Santo Swing',
    categories: ['Santo'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Santo santo, es el Señor.
Santo santo, es Nuestro Dios.

Coro:
Llenos están, el cielo y la tierra,
de tu gloria Señor, llenos están, llenos de ti.

Hosanna en el cielo, Bendito el que viene,
bendito el que viene, en nombre del Señor;

Coro

De tu gloria Señor, llenos están, llenos de ti`
  },
  {
    id: 'santo-lento',
    title: 'Santo Lento',
    originalKey: 'Am',
    categories: ['Santo'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Santo, Santo, Santo es el Señor Dios del universo.
Llenos están, el cielo y la tierra, de tu gloria, hosanna.

Ohsanna (Ohsanna)
Ohsanna (Ohsanna)
Ohsanna (Ohsanna)
En el cielo (x2)

Bendito el que viene, en nombre del Señor,
Ohsanna en el cielo, Ohsanna

Ohsanna (Ohsanna)
Ohsanna (Ohsanna)
Ohsanna (Ohsanna)
En el cielo (x2)`
  },
  {
    id: 'santo-juvenil',
    title: 'Santo Juvenil',
    categories: ['Santo'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Santo es el Señor
Dios del Universo x3

Puente:
Porque grande es Él...

Coro:
Oh oh oh Hosanna en el cieeeeelo x3
Porque grande es Él...
Bendito es
Bendito es el que viene... x3
Porque grande es Él...

Vuelve coro`
  },
  {
    id: 'santo-merengue',
    title: 'Santo Merengue',
    categories: ['Santo'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Santo, Santo, Santo, es el Señor Dios del universo,
llenos están el cielo y la tierra de tu gloria.

Hosanna, en el cielo
Bendito el que viene en nombre del Señor
Hosanna en el cielo
Hosanna`
  },
  {
    id: 'santo-via-raisa',
    title: 'Santo Via Raisa',
    categories: ['Santo'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Santo, Santo (x2)
Santo Dios del universo
Llenos están el cielo y la tierra
De su Gloria

Ohsanna en el cielo, bendito es el que viene en nombre de Dios (x3)`
  },
  {
    id: 'santo-joel',
    title: 'Santo Joel',
    categories: ['Santo'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Santo, Santo, Santo,
es el Señor
Dios del universo,
llenos están el cielo
y la tierra de tu gloria.

Hosanna en el cielo,
Hosanna en el cielo.
Bendito el que viene
en nombre del Señor,
Hosanna en el cielo. (bis)`
  },
  {
    id: 'no-hay-un-saludo-mas-lindo',
    title: 'No Hay un Saludo Más Lindo',
    categories: ['Paz'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `//No hay un saludo más lindo,
que el saludo del cristiano.//
//Te da la mano y te dice:
Dios te bendiga mi hermano//

//Dios te bendiga (x2)
Dios te bendiga mi hermano//`
  },
  {
    id: 'la-paz-te-doy',
    title: 'La Paz te Doy',
    categories: ['Paz'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `La paz te doy a ti, mi hermano,
la paz que Dios me regaló,
y en un abrazo a ti te entrego
la paz que llevo en mi corazón. (bis)

Recíbela, recíbela,
esta es la paz
que el mundo no te puede dar. (bis)`
  },
  {
    id: 'oh-cordero',
    title: 'Oh Cordero',
    originalKey: 'C',
    categories: ['Cordero'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `//Oh, Cordero, Cordero,
Cordero de Dios que quitas
el pecado del mundo
Ten piedad de nosotros//

Oh, Cordero, Cordero,
Cordero de Dios que quitas
el pecado del mundo
Ten piedad de nosotros
Y danos la paz.
La paz.`
  },
  {
    id: 'cordero-via-raisa',
    title: 'Cordero Via Raisa',
    categories: ['Cordero'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `[Hombres]
Cordero de Dios que quitas el pecado del mundo.
Cordero de Dios que quitas el pecado del mundo.
Ten piedad de nosotros, de nosotros ten piedad, ten piedad de nosotros, de nosotros ten piedad.

[Mujeres]
Cordero de Dios que quitas el pecado del mundo.
Cordero de Dios que quitas el pecado del mundo.
Ten piedad de nosotros, de nosotros ten piedad, ten piedad de nosotros, de nosotros ten piedad.

[Todos]
Cordero de Dios que quitas el pecado del mundo.
Cordero de Dios que quitas el pecado del mundo.
Ten piedad de nosotros, de nosotros ten piedad, ten piedad de nosotros y danos, danos la paz.`
  },
  {
    id: 'cordero-de-dios-nuevo',
    title: 'Cordero de Dios (Nuevo)',
    originalKey: 'G',
    categories: ['Cordero'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Cordero de Dios, quitas el pecado, el pecado del mundo. (bis)

//Danos//
//Danos//
Danos la paz.`
  },
  {
    id: 'yo-siento-senor',
    title: 'Yo Siento Señor',
    categories: ['Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Yo siento Señor que tú me amas
Yo siento Señor que te puedo amar
Háblame Señor que tu siervo escucha
Háblame que quieres de mí

Coro:
Señor tú has sido grande para mí
En el desierto de mi vida háblame
Yo quiero estar dispuesto a todo
Toma mi ser, mi corazón es para ti
//Por eso canto tus maravillas
Por eso canto tu amor//

Lara, lara, lara, la, la, la
Te alabo Jesús por tu grandeza
Mil gracias te doy por tu gran amor
Heme aquí Señor para acompañarte
Heme aquí que quieres de mí

Coro`
  },
  {
    id: 'cirineo',
    title: 'Cirineo',
    categories: ['Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `He caído mil veces
Y siempre me ofreces tu mano
Cuando vago en tinieblas
Encuentro en tus ojos la luz
Y tu amor es tan sincero
Que eres tú mi Cirineo
Cuando tengo que cargar alguna cruz

Coro:
//Eres mi Cirineo, eres amor y luz
Has dado nueva vida muriendo en una cruz
Amado Cristo vivo que estás dentro de mí
Enséñame el camino, para llegar a ti//

He faltado a la ley del amor
Y tú nunca me acusas
Ni te ofendes
Cuando por mi cuenta yo dejo el redil
Y me mata un desconsuelo
Cuando pienso que te pierdo
Mas tus brazos se abren siempre para mí

Porque quiero cantar en el coro
Celeste que tienes
Porque quiero en tus brazos de luz
Por siempre morar
O morir en la quietud
De un ocaso en una cruz
Si una nueva vida
Tengo que enseñar

(Se repite el coro cuanto se necesite)`
  },
  {
    id: 'jesus-amigo',
    title: 'Jesús Amigo',
    categories: ['Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Hoy te quiero contar Jesús Amigo,
que contigo estoy feliz,
Si tengo tu amistad lo tengo todo,
pues estás dentro de mí,
Después de comulgar
me haces como Tú,
me llenas con tu paz,
En cada pedacito de este Pan,
completo estás y así te das.
Estás ahí por mí, porque conoces
que sin ti pequeño soy,
De ahora en adelante,
nada nos separará ya lo verás.

Coro:
Te escondes en el Pan
y aunque no te pueda ver,
te puedo acompañar,
es mi lugar preferido.
Hoy quiero comulgar
abrirte mi corazón,
y así de par en par
eres mi mejor amigo.

Dos mil años atrás a tus amigos,
invitaste a cenar,
ahí les prometiste que con ellos,
por siempre ibas a estar.
Y ahora cada vez que el sacerdote
eleva el Pan en el altar,
me pongo de rodillas porque sé
que en esa Hostia Tú estás.

Coro

Me vuelves a salvar
como lo hiciste en la cruz,
y en cada Misa Tú repites tu sacrificio.`
  },
  {
    id: 'es-mi-cuerpo-siempre-nos-ama-el-senor',
    title: 'Es mi Cuerpo / Siempre nos Ama el Señor',
    categories: ['Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Siempre nos ama el Señor, como nadie nos amó.
Él nos guía sin cesar por las sendas de la luz.
En su pan al compartir, nos entrega así su amor.
Es el pan de la unidad, el pan de Dios.

Coro:
Es mi cuerpo, coman todos de Él.
Es mi sangre, que doy a beber.
Porque soy la Vida, porque soy Amor.
¡Oh, Señor! Haz que vivamos en tu amor.

Siempre nos ama el Señor, como nadie nos amó.
Para la gente del pueblo era el hijo de José.
Como lo hacen sus amigos, con sus manos trabajó.
Él conoce del obrero su dolor.

Siempre nos ama el Señor, como nadie nos amó.
Al hambriento le da el pan, al cautivo, libertad;
a los ciegos da la luz, al sediento de beber.
Soy el Dios que de los pobres me acordé.

Siempre nos ama el Señor, como nadie nos amó.
Tan sublime era su amor, que murió sobre la cruz.
Esta prueba de un amor que nadie nunca nos dio,
es del hombre, que al morir, fue vencedor.

Siempre nos ama el Señor, como nadie nos amó.
Nos entrega por amor y nos hace renacer.
Los cristianos de este mundo de su Cuerpo miembros son,
nadie puede separarnos de su amor.`
  },
  {
    id: 'mi-barca-me-has-mirado-a-los-ojos',
    title: 'Mi Barca / Me has Mirado a los Ojos',
    categories: ['Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Tú has venido a la orilla
No has buscado a sabios ni a ricos
Tan solo quieres que yo te siga

Coro:
Señor, me has mirado a los ojos
Sonriendo, has dicho mi nombre
En la arena, he dejado mi barca
Junto a ti, buscaré otro mar

Tú sabes bien lo que tengo
En mi barca, no hay oro ni plata
Tan solo redes y mi trabajo

Coro
Tú necesitas mis manos
Mi cansancio que a otros descanse
Amor que quiera seguir amando

Coro
Tú, pescador de otros lagos
Ansia eterna de almas que esperan
Amigo bueno, que así me llamas

Coro
Junto a ti, buscaré otro mar (x3)`
  },
  {
    id: 'entre-tus-manos',
    title: 'Entre tus Manos',
    categories: ['Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Estribillo:
Entre tus manos, está mi vida, Señor
Entre tus manos, pongo mi existir
Hay que morir, para vivir
Entre tus manos, confío mi ser

Si no muere, el grano de trigo
Si no muere, sólo quedará
Pero si muere, en abundancia dará
Un fruto eterno, que no morirá

Estribillo`
  },
  {
    id: 'como-el-padre-me-amo',
    title: 'Como el Padre me Amó',
    categories: ['Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Estribillo:
//Como el Padre me amó,
Yo os he amado,
Permaneced en mi amor. (x2)//

Si guardáis mis palabras, y como hermanos os amáis,
compartiréis con alegría, el don, de la fraternidad.
Si os ponéis en camino, sirviendo siempre a la verdad,
fruto daréis en abundancia, mi amor, se manifestará.

Estribillo
No veréis amor tan grande, como aquél que os mostré.
Yo doy la vida por vosotros: amad, como Yo os amé.
Si hacéis lo que os mando, y os queréis de corazón,
compartiréis mi pleno gozo, de amar, como Él me amó.

Estribillo`
  },
  {
    id: 'cristo-salvador',
    title: 'Cristo Salvador',
    categories: ['Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Eres mi fuerza y mi poder
El gran tesoro que busqué
Eres mi todo Dios...
Perla de precio sin igual
Nunca tu amor podré dejar
Eres mi todo Dios...

Cristo Salvador, digno de adorar...
Cristo Redentor, digno de adorar...

Diste tu vida allá en la Cruz
Resucitaste mi Jesús
Eres mi todo Dios...
En sequedad o en tentación
Tú me sostienes mi Señor
Eres mi todo Dios...

Cristo Salvador, digno de adorar...
Cristo Redentor, digno de adorar...
(x3)`
  },
  {
    id: 'yo-soy-el-pan-de-vida',
    title: 'Yo Soy el Pan de Vida',
    categories: ['Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Yo soy el Pan de vida
El que viene a mí no tendrá hambre.
El que cree en mí no tendrá sed.
Nadie viene a mí, si mi Padre no lo atrae.
Yo lo resucitaré, Yo lo resucitaré,
Yo lo resucitaré, en el día final.

El pan que yo daré,
es mi cuerpo, vida para el mundo.
El que siempre coma de mi carne,
vivirá en mí, como yo vivo en mi Padre.

Yo soy esa bebida,
que se prueba y no se tiene sed.
El que siempre beba de mi sangre,
vivirá en mí, y tendrá la vida eterna.`
  },
  {
    id: 'no-he-venido-a-pedirte',
    title: 'No he Venido a Pedirte',
    categories: ['Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `No he venido a pedirte, como suelo, Señor
Si antes de yo clamarte, conoces mi petición
Solo quiero escucharte, pon el tema, Señor
Caminar por el parque, y dedicarte una canción

Coro:
Tan solo he venido
A estar contigo
A ser tu amigo
A compartir con mi Dios
A adorarte
Y darte gracias
Por siempre gracias
Por lo que has hecho, Señor conmigo

Cuéntame de tus obras
¿Qué hay de nuevo, Señor?
Y de paso pregunto
¿Cómo es la piel del sol?
Y yo solo quiero abrazarte
Bendecirte, mi Dios
Caminar por las calles
Y abrirte mi corazón (eh-yeh-yeh yeh yeh)

Coro`
  },
  {
    id: 'eucaristia-milagro-de-amor',
    title: 'Eucaristía (Milagro de Amor)',
    originalKey: 'C',
    categories: ['Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Eucaristía, milagro de amor
Eucaristía, comida de pan
Eucaristía, signo de paz
Milagro patente en forma de pan.

Ven sáciate, ven al altar, Dios es comida, que se nos da.
Ven sáciate, ven al altar, Dios es comida que se nos da (Bis)

Hoy comulgamos tu gran amor, hoy compartimos, este gran don.
Que nos impulsa a predicar, a todo el mundo evangelizar.

Tu amor nos impulsa a ofrecernos, a los hermanos, en caridad.
Ser servidores de los demás, entregando todo con humildad.`
  },
  {
    id: 'llevame-a-la-cruz',
    title: 'Llévame a la Cruz',
    categories: ['Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Si mis oraciones
Hablan más de mí
Quiero disculparme
Se trata de ti
Si me he olvidado
De lo que un día fui
Vuelve a recordarme
Que nada soy sin ti

Coro:
Ven y llévame a la cruz
Donde solo existes Tú
Wuo-oh, oh
Solo Tú

Si me gano el mundo
Y te pierdo a ti
De nada me vale
Tú eres mi vivir
Eres mi tesoro
Eres mi existir
Yo sé que tengo todo
Si te tengo a ti

Coro

Hoy me niego a lo que soy
Ven y lléname Señor
Ven y llena nuestro corazón (x3)
Jesús
Ven y llena nuestro corazón (x3)
Jesús
Ven y llena nuestro corazón (x3)
Jesús
Ven y llena nuestro corazón (x3)
Jesús

Oh, oh, woh-oh-uh
Jesús

Coro`
  },
  {
    id: 'es-un-deleite',
    title: 'Es un Deleite',
    originalKey: 'D',
    categories: ['Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Es un deleite para mí
al recibirte en comunión
y saborear tu corazón,
tu cuerpo y sangre, mi Jesús. (bis)

Incomparable es tu amor por mí, Jesús,
incomparable es tu gran amor, Señor,
que no puedo comprender que siendo tú el Rey
te hayas quedado en este humilde pan.

Incomparable es tu amor por mí, Jesús,
incomparable es tu gran amor, Señor,
que no puedo comprender que siendo tú el Rey
te hayas quedado en este humilde pan. (x3)`
  },
  {
    id: 'me-has-seducido',
    title: 'Me has Seducido',
    originalKey: 'Am',
    categories: ['Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Señor, no soy nada,
¿por qué me has llamado?
Has pasado por mi puerta y bien sabes
que soy pobre y soy débil.
¿Por qué te has fijado en mí?

Me has seducido, Señor, con tu mirada.
Me has hablado al corazón y me has querido.
Es imposible conocerte y no amarte.
Es imposible amarte y no seguirte.
Me has seducido, Señor.

Señor, yo te sigo
y quiero darte lo que pides,
aunque hay veces que me cuesta darlo todo.
Tú lo sabes, yo soy tuyo.
Camina, Señor, junto a mí.

Me has seducido, Señor, con tu mirada.
Me has hablado al corazón y me has querido.
Es imposible conocerte y no amarte.
Es imposible amarte y no seguirte.
Me has seducido, Señor. (bis)`
  },
  {
    id: 'popurri',
    title: 'Popurrí',
    categories: ['Salida'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Mi Dios está vivo,
Él no está muerto,
Mi Dios está vivo,
en mi corazón,
mi Dios está vivo, ha resucitado.
lo siento en mis manos,
Lo siento en mis pies,
Lo siento en mi alma y en mi ser.

¡Oh, oh, oh, oh!, hay que nacer del agua.
¡Oh, oh, oh, oh!, hay que nacer del Espíritu de Dios.
¡Oh, oh, oh, oh!, hay que nacer del agua y del Espíritu, de Dios.
Hay que nacer del Señor. (Bis)

Prepárate para que sientas,
Prepárate para que sientas,
Prepárate para que sientas el Espíritu de Dios.

Déjalo que se mueva,
Déjalo que se mueva,
Déjalo que se mueva dentro de tu corazón.`
  },
  {
    id: 'buscamos-un-avivamiento',
    title: 'Buscamos un Avivamiento',
    categories: ['Salida'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Estamos buscando un avivamiento.
Estamos buscando el poder de Dios.
//El poder del Padre, el poder del Hijo, el poder del Santo Espíritu de Dios.//`
  },
  {
    id: 'peregrino',
    title: 'Peregrino',
    categories: ['Salida'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Peregrino ¿a dónde vas?, si no sabes a dónde ir.
Peregrino por un camino que va a morir.
Si el desierto es un arenal, el desierto de tu vivir, ¿quién te guía y te acompaña en tu soledad?

Sólo Él, mi Dios,
que me dio la libertad,
sólo Él, mi Dios, me guiará (Bis)

Peregrino que a veces vas sin un rumbo en tu caminar,
peregrino que vas cansado de tanto andar.
Buscas fuentes para tu sed y un rincón para descansar,
vuelve, amigo, que aquí lo encontrarás.

Peregrino sin un por qué, peregrino sin una luz,
peregrino por el camino que va a la cruz.
Dios camina en tu soledad, ilumina tu corazón,
compañero de tus senderos buscando amor.`
  },
  {
    id: 'vamos-a-emprender-un-viaje',
    title: 'Vamos a Emprender un Viaje',
    categories: ['Salida'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Vamos a emprender un viaje
Oye tienes que llegar
Jesucristo es el camino
Es palabra y es verdad

Puente:
Hoy, vamos hacia un des-ti-no
Y nos espera un gran amigo x2
Jesús...
Parapapa papara
Parapapa papa... x2

Tome su maleta hermano
Vamos todos de la mano
Juntos nos vamos de viaje
A recibir un gran mensaje`
  },
  {
    id: 'quiero-agradecer',
    title: 'Quiero Agradecer',
    categories: ['Salida'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Quiero agradecer lo que me has dado mi Señor
La alegría, la familia, mis hermanos y el amor.
Y quiero compartir que cada día puedo ver
El amanecer,
Y dar las gracias al Señor mi Salvador.

Coro:
Es mi Dios, es mi Señor
Él no se cansa de esperar siempre presente en el lugar
Es mi Dios, es mi Señor
Yo tengo siempre la esperanza
De que su amor nunca me faltará (Bis)

Cristo es el Señor en espíritu y verdad
Y ya tengo la esperanza de que a mi lado siempre está
Doy las gracias al Señor por la alegría de vivir,
De abrazar a mis hermanos
Y con ellos compartir

Coro`
  },
  {
    id: 'pasa-fuego',
    title: 'Pasa Fuego',
    categories: ['Salida'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Pasa fuego por mi brazo ahora (x3) Oh Señor
Pasa fuego por mi pierna ahora (x3) Oh Señor
Pasa fuego por mi cabeza ahora (x3) Oh Señor
Pasa fuego por mi corazón ahora (x3) Oh Señor

//Y dice,
Brazo, pierna, cabeza, corazón (x3)//`
  },
  {
    id: 'mi-amigo-claret',
    title: 'Mi Amigo Claret',
    categories: ['Salida'],
    tags: [],
    chordsUsed: [],
    content: `Quiero cantarle a un amigo llamado Claret.
Él caminó por el mundo llevando su Fe.
Un misionero incansable era su vocación.
Llevaba la biblia en sus manos al pueblo de Dios.

Un misionero valiente,
un misionero ideal,
Era Claret un amigo
con quien podría contar (Bis)

Todos los niños y pobres de la gran ciudad.
Siguieron los pasos del padre llamado Claret.
Era su afán el telar, trabajó sin parar.
Rezaba a la Virgen María por la humanidad.

Un misionero valiente... (Bis)

En todos sus sueños veía a la Virgen María.
Para que fuera fundada su congregación.
Hijos del Inmaculado Corazón de María
Fue Claret su fundador y cumplió la Misión.

Un misionero valiente... (Bis)`
  },
  {
    id: 'resucita-hoy',
    title: 'Resucita Hoy',
    categories: ['Salida'],
    liturgicalSeasons: ['pascua'],
    tags: [],
    chordsUsed: [],
    content: `Mirad, Jesús resucita hoy,
Mirad, la tumba está vacía
El Padre ha pensado en Él
De los hombres es Señor,
De la vida, salvador
Mirad, Jesús resucita hoy

Mirad, vive a nuestro lado
La muerte no tiene poder
Proclamad por la fe
Que esta vive y somos libres porque
Él resucita hoy, Él vive entre
nosotros es Cristo el Señor
Aleluya... aleluya (bis)

Mirad, Jesús resucita hoy
Nos da la paz con su palabra
El gozo vuelve al corazón
Con su espíritu de amor
Nuestra vida cambiará
Mirad, Jesús resucita hoy
Su amor no nos dejará
Su fuerza nos empujará
Él será guía y luz
Esperanza y fortaleza porque...
Él resucita hoy...`
  },
  {
    id: 'la-madrugada-del-domingo',
    title: 'La Madrugada del Domingo',
    categories: ['Salida'],
    liturgicalSeasons: ['pascua'],
    tags: [],
    chordsUsed: [],
    content: `Aleluya, Cristo resucitó de madrugada el domingo (Bis)

Fueron mujeres al sepulcro. La piedra,
un ángel removió; Les dijo: "Ha resucitado,"
Y al marchar les salió el Señor.

La Magdalena fue llorando y Cristo se
le apareció; Le pidió ir a sus hermanos
con un encargo que le dio.

A los discípulos de tarde, Cristo
también se presentó. Les enseñó las
cinco llagas; dando la paz les saludó.

Tomás no estaba en ese encuentro; y
ver pidió para creer. Cristo llegó y le
dijo: "Mira, palpa mi herida y ten fe."`
  },
  {
    id: 'siempre-es-pentecostes',
    title: 'Siempre es Pentecostés',
    categories: ['Salida'],
    tags: [],
    chordsUsed: [],
    content: `Cuando rezamos, cuando cantamos, cuando la fiesta es
un celebrar gozoso es el día grande: Pentecostés.
Cuando llevamos, en nuestras manos un resplandor de luz
/en nuestro pecho vive y palpita, el que murió en la cruz./ (2)

Estribillo:
Cuando el Señor, alienta en nosotros,
siempre es Pentecostés.
Cuando el amor, nos lanza a la vida,
siempre es Pentecostés.

Cuando queremos comprometernos en una misma fe.
una tarea, un compromiso...
siempre es Pentecostés.
Cuando decimos sí a la Iglesia
con plena lucidez,
/soplan de nuevo vientos del cielo,
porque es Pentecostés./ (2)

Estribillo`
  },
  {
    id: 'sonriele-a-jesus',
    title: 'Sonríele a Jesús',
    categories: ['Salida'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Sonríe que Jesús te ama
Sonríe que Jesús te quiere
Sonríe que Jesús te da la vida
Sonríele a Jesús de Nazareth

Canta canta para Él
Porque Jesús, ya te salvó (bis)

Enamorado de Jesús, enamorado
Enamorado de Jesús (bis)
Enamorado de Él

En mi corazón tengo escrito
Jesucristo de Nazareth (bis)`
  },
  {
    id: 'contigo-ire',
    title: 'Contigo Iré',
    artist: 'Luis Enrique CMF',
    categories: ['Adoración'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Me has llamado,
has dicho mi nombre
Te has fijado en mí.
Desde el vientre de mi madre
Me has soñado, Señor.

Puente:
En tus manos confío mis pasos....

Coro:
Yo iré,
Envíame...
Yo seguiré tus huellas y confiaré

Yo iré,
Caminaré...
Abrazando tu palabra, no dudaré...
Contigo yo siempre iré

Con tu fuerza, me sostienes
Con tu gracia, Señor

Tú me pides que entregue mi vida
Que te ofrezca mi don.

Puente...

Coro`
  },
  {
    id: 'mi-mejor-version',
    title: 'Mi Mejor Versión',
    artist: 'Luis Enrique',
    categories: ['Adoración'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Lo que soñé en la vida hoy no lo siento.
Proyectos que vararon en el trayecto.
Yo me esforcé, todo empeñé por mis sueños.
Lo diseñé y lo busqué, y hoy no lo encuentro.

Pero llegaste un día a mi aposento.
Colmaste de alegría cada momento.
No tuve que hacer, nada realicé, todo es nuevo.
Abrí mi corazón y dije hágase, y ahora lo entiendo...

Que para ser feliz, para llegar,
hay que perder para ganar
Así eres tú, así oh Jesús...

Que mi vida es, una barca más,
en la que tú eres el capitán
Así eres tú, así oh Jesús...

Que si quiero ser libre, solo hay una opción
Renunciar al control, para vivir mi mejor versión`
  },
  {
    id: 'tu-modo',
    title: 'Tu Modo',
    artist: 'Cristóbal Fones',
    categories: ['Adoración'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Jesús, al contemplar en tu vida
el modo que Tú tienes de tratar a los demás
me dejo interpelar por tu ternura,
tu forma de amar nos mueve a amar;
tu trato es como el agua cristalina
que limpia y acompaña el caminar.

Jesús, enséñame tu modo
de hacer sentir al otro más humano,
que tus pasos sean mis pasos;
mi modo de proceder.

Jesús, hazme sentir con tus sentimientos,
mirar con tu mirada, comprometer mi acción,
donarme hasta la muerte por el reino,
defender la vida hasta la cruz,
amar a cada uno como amigo,
y en la oscuridad llevar tu luz.

Jesús, enséñame tu modo
de hacer sentir al otro más humano,
que tus pasos sean mis pasos;
mi modo de proceder.

Jesús, yo quiero ser compasivo con quien sufre,
buscando la justicia, compartiendo nuestra fe,
que encuentre una auténtica armonía
entre lo que creo y quiero ser,
mis ojos sean fuente de alegría,
que abrace tu manera de ser.

Jesús, enséñame tu modo
de hacer sentir al otro más humano,
que tus pasos sean mis pasos;
mi modo de proceder.`
  },
  {
    id: 'presencia-real',
    title: 'Presencia Real',
    originalKey: 'Am',
    categories: ['Adoración'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `//Ángeles bajando y llegando hasta el altar
se unen a adorar a Jesús Eucaristía//

Presencia real, amor de los amores,
Jesús Eucaristía, Jesús el pan de vida.
Presencia real, amor de los amores,
Jesús Eucaristía, Jesús el pan de vida.

//Ángeles bajando y llegando hasta el altar
se unen a adorar a Jesús Eucaristía//`
  },
  {
    id: 'sopla-fuerte',
    title: 'Sopla Fuerte',
    originalKey: 'G',
    categories: ['Adoración'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Espíritu Santo, sopla sobre mí,
Espíritu Santo, sopla sobre mí. (bis)

Sopla fuerte, sopla fuerte,
que quiero sentirte, que quiero sentirte. (bis)

Espíritu Santo, sopla sobre mí,
Espíritu Santo, sopla sobre mí. (bis)`
  },
  {
    id: 'que-bien-se-esta-aqui',
    title: 'Qué Bien se Está Aquí',
    originalKey: 'A',
    recommendedCapo: 1,
    categories: ['Adoración'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Qué bien se está aquí, en tu presencia,
glorioso por siempre, Señor.
Qué bien se está aquí, a tu lado,
sintiendo tu paz y tu amor.

Cuán hermoso eres, Señor,
tú no tienes comparación.
Quiero permanecer
por siempre en tu amor.

Qué bien se está aquí, en tu presencia,
glorioso por siempre, Señor.
Qué bien se está aquí, a tu lado,
sintiendo tu paz y tu amor.

Cuán hermoso eres, Señor,
tú no tienes comparación.
Quiero permanecer
por siempre en tu amor. (bis)

Con todo mi corazón
te adoro, Señor. (x4)

Cuán hermoso eres, Señor,
tú no tienes comparación.
Quiero permanecer
por siempre en tu amor.

Con todo mi corazón
te alabo, Señor. (x3)

Cuán hermoso eres, Señor,
tú no tienes comparación.
Quiero permanecer
por siempre en tu amor.

Qué bien se está aquí, en tu presencia.`
  },
  {
    id: 'tu-el-unico-rey',
    title: 'Tú, el Único Rey',
    originalKey: 'C',
    categories: ['Alabanza', 'Adoración'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Tú, el Único Rey que tiene que reinar,
el Único Señor al que voy a alabar.
Hoy levanto el corazón al que lo conquistó,
simplemente porque Tú eres Dios.

Quiero ponerte por encima de todo,
en cada momento sentarte en el trono.
Que tu alabanza esté siempre en mi boca
y reconocer que Tú eres Dios.

Que alabarte a Ti, Señor,
sea siempre lo primero.
Fijo mi mirada en el cielo.

Tú, el Único Rey que tiene que reinar,
el Único Señor al que voy a alabar.
Hoy levanto el corazón al que lo conquistó,
simplemente porque Tú eres Dios.

Y a Ti, toda la alabanza,
todo el poder y el honor,
toda la gloria al Señor. (x4)

Tú, el Único Rey que tiene que reinar,
el Único Señor al que voy a alabar.
Hoy levanto el corazón al que lo conquistó,
simplemente porque Tú eres Dios.`
  },
  {
    id: 'puedo-entrar',
    title: 'Puedo Entrar',
    originalKey: 'G',
    recommendedCapo: 1,
    categories: ['Adoración', 'Comunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Puedo entrar confiadamente
ante ti, para adorarte.
Puedo entrar como hija
ante ti, para pedirte perdón.

Tú me purificarás,
lavarás mis vestiduras otra vez
y me llenarás
de tu amor,
de tu amor.

Puedo entrar confiadamente
ante ti, para adorarte.
Puedo entrar como hijo
ante ti, para postrarme a tus pies.

Tú me purificarás,
lavarás mis vestiduras otra vez
y me llenarás
de tu amor. (bis)

De tu amor,
de tu amor.
Me devuelves la alegría de tu salvación,
Tú me levantas
con tu amor.

Tú eres
compasivo,
bondadoso,
lento a la ira,
rico en misericordia.

Compasivo,
bondadoso,
lento a la ira,
por tu misericordia.

Tú me purificarás,
lavarás mis vestiduras otra vez
y me llenarás
de tu amor,
de tu amor.`
  },
  {
    id: 'bendito-sea-dios',
    title: 'Bendito sea Dios',
    originalKey: 'C',
    categories: ['Adoración'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Bendito, bendito, bendito sea Dios,
los ángeles cantan y alaban a Dios,
los ángeles cantan y alaban a Dios. (bis)

Yo creo, Jesús mío, que estás en el altar,
oculto en la hostia te vengo a adorar,
oculto en la hostia te vengo a adorar.

Bendito, bendito, bendito sea Dios,
los ángeles cantan y alaban a Dios,
los ángeles cantan y alaban a Dios. (bis)`
  },
  {
    id: 'maria-doncella-divina',
    title: 'María Doncella Divina',
    categories: ['María'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Dijiste sí
y la tierra estalló de alegría
Dijiste sí
Y en tu vientre latía divina la salvación

Puente:
Hágase en mí de corazón
La voluntad de mi Señor
Que se cumplan en mí
Cada día los sueños de Dios.

Coro:
María
Las tinieblas se harán mediodía
A una sola palabra que digas
En tus labios alumbra ya el sol
María
La doncella que Dios prometía
Un volcán de ternura divina
Primavera de Dios redentor (bis) x2

Gabriel tembló
Conmovido con tanta belleza
Madre de Dios
Como ve tu mirada el Dios de la anunciación.

Puente

Coro`
  },
  {
    id: 'maria-tu-que-velas-junto-a-mi',
    title: 'María, Tú que Velas Junto a Mí',
    categories: ['María'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `María, Tú que velas junto a mí,
y ves el fuego de mi inquietud.
María, Madre, enséñame a vivir
con ritmo alegre de juventud /2

Ven, Señora a nuestra soledad,
ven a nuestro corazón,
a tantas esperanzas que se han muerto,
a nuestro caminar sin ilusión.

Ven, y danos la alegría
que nace de la fe y del amor,
el gozo de las almas que confían
en medio del esfuerzo y el dolor.

/ María, Tú que velas junto a mí,
y ves el fuego de mi inquietud.
María, Madre, enséñame a vivir
con ritmo alegre de juventud /3`
  },
  {
    id: 'salve-regina',
    title: 'Salve Regina',
    categories: ['María'],
    tags: [],
    chordsUsed: [],
    content: `Salve Regina, Madre de misericordia
Vida y dulzura, esperanza nuestra, Salve

Salve Regina
A ti clamamos los desterrados hijos de Eva
A ti suspiramos, llorando, en este valle de lágrimas
Abogada nuestra, vuelve a nosotros tus ojos,
Muéstranos tras este destierro el fruto de tu vientre, Jesús.

Salve Regina, Madre de misericordia
Oh Clemente, oh pía, oh dulce Virgen María
Salve Regina
Salve Regina, Salve, Salve`
  },
  {
    id: 'estrella-del-cielo',
    title: 'Estrella del Cielo',
    categories: ['María'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Has escuchado
Los gemidos de mi corazón
Oh-uh-oh, uh
Le has ofrecido
Lo más roto de mí, a tu Hijo
Oh-uh-oh, uh

Y es por esto que hoy recurro a ti
Y es por esto que hoy recurro a ti
Pues eres tú, la estrella del cielo
(La estrella del cielo) el camino más corto y perfecto
Eres tú, el camino más seguro a Jesús

Oh María (oh María), ¡quédate!
Oh María (oh María), ¡acompáñame!
Oh María (oh María), ¡quédate!

Has contado
Cada lágrima, que he derramado
Oh-uh-oh, uh
Y con tu manto
Me has cubierto y me has auxiliado
Uh-oh, uh-oh-oh

Y es por esto que hoy recurro a ti
Y es por esto que hoy recurro a ti
Pues eres tú, la estrella del cielo
(La estrella del cielo) el camino más corto y perfecto
Eres tú, el camino más seguro a Jesús

Oh María (oh María), ¡quédate!
Oh María (oh María), ¡acompáñame!
Oh María (oh María), ¡quédate!

¡Oh María!
Ah-ah
Uh-oh, oh-oh-oh-oh (oh María)
Eres más que una fiel acompañante
Eres tú, la Reina del universo
Eres tú, la Reina de mi corazón (oh-uh-oh-uh)

Oh María, ¡quédate!
Oh María, ¡acompáñame!
Oh María, ¡quédate!`
  },
  {
    id: 'hacia-ti',
    title: 'Hacia Ti',
    categories: ['Otros'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `Hacia ti
Hacia ti
Morada Santa
Hacia ti
Tierra del Salvador
Peregrinos...
Caminantes...
Vamos hacia ti!`
  },
  {
    id: 'dibujo-perfecto',
    title: 'Dibujo Perfecto',
    categories: ['Otros'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: [],
    content: `El Padre pintó un dibujo
El Hijo lo coloreó
Y como quedó tan perfecto,
Su Espíritu vida le dio (bis)
Y aquí estoy yo,
Soy el dibujo perfecto de Dios (bis)

Dibujó mi manos,
Dibujó mis pies,
Dibujó mi cabeza, mi oreja también
Dibujó mi nariz, mi boca también
Soy el dibujo perfecto de Dios

Dibujó mi manos,
Dibujó mis pies,
Dibujó mi cabeza, mi oreja también
Dibujó mi nariz, mi boca también
Soy el dibujo perfecto de Dios`
  }
];
