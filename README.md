# 🎸 Acordes de Fe - Cancionero Comunitario & Visor de Acordes (Estilo Cifra Club)

Aplicación web profesional y moderna diseñada para coros, músicos y comunidades de jóvenes (adoración, jornadas, vigilias y misas). Desarrollada con **React**, **TypeScript** y **Tailwind CSS**.

---

## 🌟 Características Principales

### 1. Dashboard / Índice de Canciones
- **Buscador en Tiempo Real**: Filtrado simultáneo por título, artista o fragmentos de la letra de la canción.
- **Filtros por Categorías y Etiquetas**: Acceso rápido a canciones de *"Todas"*, *"Adoración"*, *"Hakuna"*, *"Jornadas"*, *"María"*, *"Alabanza"*, *"Comunión"* y *"Favoritas"*.
- **Contadores Dinámicos**: Muestra la cantidad de canciones por categoría en tiempo real.
- **Tarjetas Interactivas**: Cada tarjeta exhibe tonalidad original, compás, tempo (BPM), etiquetas, acordes previos y botón para marcar como favorita.
- **Persistencia en LocalStorage**: Las canciones favoritas se guardan automáticamente en el navegador.

### 2. Visor de Cifrado Profesional (Song Viewer)
- **Acordes Alineados sobre la Letra**: Renderizado tipo *cifrado en línea* con tipografía monoespaciada en azul eléctrico brillante sobre fondo oscuro, calculando la anchura de las sílabas para evitar solapamientos.
- **Transpositor Armónico en Tiempo Real**:
  - Botones `+` / `-` para cambiar de tono por semitonos en vivo.
  - Motor matemático cromático compatible con acordes mayores, menores, séptimas, suspendidos, notas agregadas y *slash chords* (ej: `D/F#`, `G/B`, `Cadd9`).
  - Botón de restablecimiento al tono original.
- **Selector de Cejilla / Capo**:
  - Configuración del traste (0 al 5) con cálculo simultáneo de la posición digitada y el tono real sonoro.
- **Diagramas de Acordes Gráficos en SVG**:
  - Mástil realista de guitarra con 6 cuerdas, trastes, marcadores de cejilla, notas pisadas con números de dedo, cuerdas al aire y cuerdas muteadas (`X`).
  - Galería superior desplegable con todos los acordes de la canción actual (actualizados con la transposición).
  - Modal interactivo al hacer clic en cualquier acorde dentro de la letra para ver su digitación ampliada.
- **Barra Flotante de Control (Modo Músico en Vivo)**:
  - **Auto-scroll regulable**: Desplazamiento automático de 1x a 5x con pausa y reanudación para tocar con ambas manos en el instrumento.
  - **Ajuste de tamaño de tipografía**: Botones `A-` / `A+`.
  - **Modo 1 o 2 columnas**: Optimizado para tablets, laptops y pantallas panorámicas.
  - Botón rápido para volver al catálogo.
  - Copiado rápido de la letra con los acordes transpuestos al portapapeles.

### 3. Paleta de Colores
- **Fondo Base**: `#06090e` (Dark Slate / Deep Dark).
- **Contenedores**: `#0f172a` con bordes sutiles `#1e293b`.
- **Acentos y Botones Activos**: Azul eléctrico `#2563eb` y `#3b82f6` con brillos sutiles.
- **Color de Acordes**: Sky Blue `#38bdf8` de alto contraste en ambientes nocturnos o de vigilia.

---

## 🚀 Instalación y Ejecución

### Prerrequisitos
- **Node.js**: v18 o superior.
- **npm** o **yarn**.

### Pasos
```bash
# 1. Instalar dependencias (si no se han instalado)
npm install

# 2. Iniciar servidor de desarrollo
npm run dev

# 3. Compilar para producción
npm run build

# 4. Probar la versión de producción
npm run preview
```

---

## 📂 Estructura del Código

```
src/
├── types/
│   └── song.ts                # Interfaces de canciones, acordes, digitación y opciones
├── data/
│   ├── mockSongs.ts           # Repertorio inicial (Hakuna, Athenas, Alfareros, Valverde, etc.)
│   └── chordDictionary.ts     # Biblioteca de digitaciones de mástil para guitarra (SVG)
├── utils/
│   ├── chordTransposer.ts     # Motor cromático de transposición de notas y acordes
│   └── chordParser.ts         # Parser de letras bracketed [G] a segmentos visuales
├── components/
│   ├── Layout/
│   │   ├── Navbar.tsx         # Cabecera con logo Acordes de Fe y estado actual
│   │   └── Footer.tsx         # Pie de página
│   ├── Dashboard/
│   │   ├── SearchAndFilter.tsx# Barra de búsqueda y selector de categorías
│   │   ├── SongCard.tsx       # Tarjetas de canción con metadatos y botón favorito
│   │   ├── SongGrid.tsx       # Cuadrícula y mensaje de estado vacío
│   │   └── Dashboard.tsx      # Vista general del índice
│   └── SongViewer/
│       ├── ChordDiagram.tsx   # Dibujado vectorial SVG del mástil de guitarra
│       ├── ChordGallery.tsx   # Galería superior de acordes de la canción
│       ├── ChordSheet.tsx     # Hoja de acordes alineados con precisión sobre la letra
│       ├── FloatingControls.tsx # Panel de control inferior flotante
│       └── SongViewer.tsx     # Contenedor del visor de canción y auto-scroll
├── App.tsx                    # Enrutador por URL hash (#/song/:id) y persistencia
├── main.tsx                   # Punto de entrada de React
└── index.css                  # Estilos globales y utilidades Tailwind
```
