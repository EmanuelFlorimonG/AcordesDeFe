# -*- coding: utf-8 -*-
"""
Monta la ficha de «Tú en mí, yo en ti», de Vale Montes, leyendo el PDF del coro.

La canción NO está en el cancionero: su letra y la transcripción de acordes son
de otros, y el cancionero es público. Aquí no hay ni una palabra de la letra;
este archivo solo sabe en qué columna va cada acorde. La letra sale del PDF al
ejecutarlo, y lo que imprime no se publica hasta que haya autorización de quien
tiene los derechos de la obra.

Las pruebas que vigilan la ficha están en tests/tuEnMiYoEnTi.test.ts y se saltan
solas mientras la canción no exista.

La letra y los acordes salen del propio documento: el script separa las líneas
de acordes de las de letra, apunta en qué columna empieza cada acorde y los
mete entre corchetes sobre la sílaba que les toca, que es como los escribe el
cancionero.

    python tu-en-mi-yo-en-ti.py "ruta/al/PDF" > ficha.txt

Lo que el PDF no dice, no se inventa:

  * La segunda mitad del primer verso va sin acordes. Esas tres frases vuelven
    a aparecer en el segundo verso, allí sí con acordes, y de ahí se copian.
    Antes de copiar nada se comprueba que las frases sean idénticas carácter a
    carácter; si no lo son, el script para y dice cuál falla.
  * El coro repetido y el coro final tampoco traen acordes. Son el mismo coro,
    así que se escriben como una llamada («Coro») y el cancionero vuelve a
    mostrarlo entero. También se comprueba que sean las mismas frases.
  * La coda hablada se queda sin acordes, pendiente de revisión musical.

Ninguna palabra se cambia y ningún acorde se mueve para cuadrar longitudes.
"""
import io
import re
import sys

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    print('Falta pypdf:  pip install pypdf', file=sys.stderr)
    raise SystemExit(1)

# Un acorde del cancionero: la nota, su alteración y lo que la acompañe.
ACORDE = re.compile(r'^[A-G][b#]?(?:m|maj|min|sus|add|dim|aug)?\d*(?:/[A-G][b#]?)?$')
PIE = re.compile(r'^(?:\d{1,2}/\d{1,2}/\d{2},|https?://)')
CREDITO = 'Transcripción by'

# --- El guion de la canción -------------------------------------------------
#
# Qué líneas de letra forman cada sección, contando desde cero sobre las que
# quedan tras limpiar cabeceras y pies. Sale de leer el PDF entero.
GUION = [
    ('seccion', 'Verso 1', 0, 6),
    ('seccion', 'Coro', 6, 11),
    ('seccion', 'Verso 2', 11, 17),
    ('llamada', 'Coro', 17, 22),
    ('seccion', 'Final', 22, 24),
    ('llamada', 'Coro', 24, 29),
    ('seccion', 'Coda', 29, 32),
]
# Las frases sin acordes del primer verso y de dónde se copian los suyos.
COPIAS = {3: 14, 4: 15, 5: 16}
# La llamada repite lo escrito en estas líneas.
CORO_ESCRITO = (6, 11)

PLANTILLA = """  }},
  {{
    id: 'tu-en-mi-yo-en-ti',
    title: 'Tú en mí, yo en ti',
    artist: 'Vale Montes',
    originalKey: 'G',
    categories: ['Comunión', 'PostComunión'],
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    chordsUsed: ['G', 'C', 'D', 'Em'],
    year: '2023',
    content: `{contenido}`
  }}
];
"""


def es_acordes(linea):
    partes = linea.split()
    return bool(partes) and all(ACORDE.match(p) for p in partes)


def leer(ruta):
    """Las líneas del PDF, sin cabecera, sin pies y sin el aviso final."""
    lector = PdfReader(ruta)
    crudas = []
    for pagina in lector.pages:
        crudas += (pagina.extract_text() or '').split('\n')
    util = []
    for linea in crudas:
        if linea.lstrip().startswith(CREDITO):
            break
        if PIE.match(linea.strip()) or len(linea.strip()) <= 1:
            continue
        util.append(linea.rstrip())
    # La cabecera es lo que va antes de la primera línea de acordes.
    primera = next(i for i, l in enumerate(util) if es_acordes(l))
    return util[primera:]


def emparejar(lineas):
    """
    Cada línea de letra con los acordes que lleva encima.

    Devuelve (letras, sueltos): `letras` es [(texto, [(columna, acorde)…])…] en
    el orden de la canción, y `sueltos` dice qué líneas de acordes no tenían
    letra debajo —los giros instrumentales— y tras qué letra aparecieron.
    """
    letras = []
    sueltos = {}
    encima = None
    for linea in lineas:
        if es_acordes(linea):
            if encima is not None:
                sueltos.setdefault(len(letras) - 1, []).append(encima)
            encima = [(m.start(), m.group()) for m in re.finditer(r'\S+', linea)]
            continue
        letras.append((linea, encima or []))
        encima = None
    if encima is not None:
        sueltos.setdefault(len(letras) - 1, []).append(encima)
    return letras, sueltos


def con_acordes(letra, posiciones):
    """
    Mete [acorde] en su columna.

    Un acorde cuya columna cae más allá de la última palabra —el giro con el
    que acaban varias frases— se escribe detrás, separado, en vez de
    apelmazarse contra la última sílaba.
    """
    salida = ''
    puesto = 0
    for columna, acorde in sorted(posiciones):
        if columna >= len(letra):
            salida += letra[puesto:] + ' [' + acorde + ']'
            puesto = len(letra)
        elif columna <= puesto:
            salida += '[' + acorde + ']'
        else:
            salida += letra[puesto:columna] + '[' + acorde + ']'
            puesto = columna
    return salida + letra[puesto:]


def comprobar(letras, avisos):
    """Las dos copias que hace el script, cada una contra su original."""
    for destino, origen in COPIAS.items():
        if letras[destino][0] != letras[origen][0]:
            avisos.append(
                f'línea {destino + 1}: no es idéntica a la línea {origen + 1}, '
                'de la que se iban a copiar los acordes. No se copia nada.'
            )
        elif letras[destino][1]:
            avisos.append(f'línea {destino + 1}: ya traía acordes en el PDF; se dejan los suyos.')
    desde, hasta = CORO_ESCRITO
    escrito = [texto for texto, _ in letras[desde:hasta]]
    for tipo, nombre, inicio, fin in GUION:
        if tipo != 'llamada':
            continue
        repetido = [texto for texto, _ in letras[inicio:fin]]
        if repetido != escrito:
            avisos.append(
                f'líneas {inicio + 1}-{fin}: no son el mismo coro que las '
                f'{desde + 1}-{hasta}. No se puede resolver como repetición.'
            )


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    letras, sueltos = leer_y_emparejar(sys.argv[1])
    avisos = []

    if len(letras) != GUION[-1][3]:
        print(f'El PDF da {len(letras)} líneas de letra y el guion espera {GUION[-1][3]}.',
              file=sys.stderr)
        print('Revisa el documento: puede traer otra transcripción.', file=sys.stderr)
        return 1

    comprobar(letras, avisos)
    if any('No se copia nada' in a or 'No se puede resolver' in a for a in avisos):
        for aviso in avisos:
            print('ERROR · ' + aviso, file=sys.stderr)
        return 1

    partes = []
    inferidas = 0
    for tipo, nombre, inicio, fin in GUION:
        if tipo == 'llamada':
            partes.append(nombre)
            continue
        cuerpo = []
        for i in range(inicio, fin):
            texto, posiciones = letras[i]
            if not posiciones and i in COPIAS:
                posiciones = letras[COPIAS[i]][1]
                inferidas += 1
            cuerpo.append(con_acordes(texto, posiciones))
            for giro in sueltos.get(i, []):
                cuerpo.append('  '.join('[' + a + ']' for _, a in giro))
        partes.append('[' + nombre + ']\n' + '\n'.join(cuerpo))

    for aviso in avisos:
        print('aviso · ' + aviso, file=sys.stderr)
    print(f'{len(letras)} líneas de letra · {inferidas} con acordes copiados del segundo verso '
          f'· 2 coros resueltos como repetición · coda sin acordes', file=sys.stderr)

    sys.stdout.reconfigure(encoding='utf-8')
    print(PLANTILLA.format(contenido='\n\n'.join(partes)))
    return 0


def leer_y_emparejar(ruta):
    return emparejar(leer(ruta))


if __name__ == '__main__':
    sys.exit(main())
