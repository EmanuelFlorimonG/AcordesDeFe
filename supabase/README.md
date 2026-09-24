# Backend de GENESARET (Supabase)

Esta carpeta contiene el esquema de la base de datos como migraciones SQL
versionadas. La base se reconstruye siempre desde aquí, nunca solo con clics en
el Dashboard.

```
supabase/
├── migrations/
│   ├── 20260918120000_editorial_catalog.sql                    catálogo, versiones, propuestas, RLS, funciones
│   ├── 20260919120000_submission_retries_and_tracking_limit.sql reintento seguro, límite de consultas
│   └── 20260920120000_submissions_through_turnstile.sql        el envío solo por la Edge Function
├── functions/submit-song/                                      Edge Function: Turnstile y envío
└── tests/database/
    └── editorial_security.test.sql                             pruebas de seguridad (pgTAP)
```

## Envío de propuestas con Cloudflare Turnstile

El navegador no puede escribir propuestas en la base de datos. El único camino es:

```
navegador (widget Turnstile) -> Edge Function submit-song -> Cloudflare siteverify
                                                          -> submit_song_submission_verified (service_role)
```

- La Edge Function comprueba el origen, pide a Cloudflare que valide el token
  (éxito, acción `submit-song` y hostname permitido) y solo entonces guarda la
  propuesta, pasando la IP del visitante para el límite de envíos.
- `submit_song_submission_verified` solo la puede ejecutar `service_role`.
  `submit_song_submission` ya no la puede ejecutar nadie desde la API.
- Secretos, siempre desde la terminal y nunca en el código ni en `VITE_`:
  - `TURNSTILE_SECRET_KEY`: `npx supabase secrets set TURNSTILE_SECRET_KEY=...`
  - `GENESARET_ALLOWED_ORIGINS` (al publicar): `https://tu-dominio` y los
    orígenes locales, separados por comas. Sin ella solo se aceptan
    `http://localhost:5173` y `http://localhost:4173`.
- La site key (pública) va en `.env.local` como `VITE_TURNSTILE_SITE_KEY`.
- Desplegar: `npx supabase functions deploy submit-song` (usa `verify_jwt = false`
  de `config.toml`: la clave publicable no es un JWT; la puerta es Turnstile).

## Qué hay en la migración

| Tabla | Para qué | Quién la lee | Quién escribe |
| --- | --- | --- | --- |
| `songs` | Catálogo oficial | Todos (solo `published`); revisores también las ocultas | Solo `approve_submission` |
| `song_versions` | Instantánea inmutable de cada publicación | Solo revisores | Solo `approve_submission`; nunca se modifica ni se borra |
| `song_submissions` | Propuestas del público | Solo revisores | Solo las funciones |
| `editorial_roles` | Quién es `admin` o `reviewer` | Cada usuario su propio rol | Nadie desde la API (se asigna en SQL) |
| `submission_rate_events` | Límite de envíos (IP en hash) | Nadie | Solo `submit_song_submission` |

Row Level Security está activado en todas. Además, los roles `anon` y
`authenticated` no tienen permiso de `insert`, `update` ni `delete` en ninguna
tabla: aunque alguien añadiera una política por error, no podrían escribir.

### Funciones

| Función | Quién puede llamarla | Qué hace |
| --- | --- | --- |
| `submit_song_submission_verified(payload, ip)` | Solo `service_role` (la Edge Function `submit-song`, tras Turnstile) | Valida, aplica límite de envíos, crea la propuesta en `pending`, devuelve código de seguimiento y token de edición |
| `submit_song_submission(payload)` | Nadie desde la API (desde 20260920120000) | Envoltorio de la anterior; se conserva por compatibilidad |
| `get_submission_status(código)` | Público (`anon`) | Devuelve solo código, tipo, título, estado, nota de revisión (si ya se revisó) y fechas |
| `approve_submission(id, song_id?, nota?)` | Usuario autenticado **con rol** | Publica en una sola transacción: canción + versión + propuesta aprobada |
| `request_submission_changes(id, nota)` | Usuario autenticado con rol | Pide cambios |
| `reject_submission(id, nota)` | Usuario autenticado con rol | Rechaza |

Las funciones de revisión comprueban el rol dentro de la base de datos
(`has_editorial_role`). Ocultar botones en React no protege nada; esto sí.

### Qué puede hacer un visitante anónimo

- Leer canciones publicadas.
- Enviar una propuesta, solo a través de la Edge Function `submit-song` y tras pasar Turnstile.
- Consultar el estado de una propuesta con su código.

### Qué no puede hacer

- Crear, modificar, ocultar o borrar canciones.
- Leer propuestas, correos, nombres, versiones o roles.
- Aprobar, rechazar o pedir cambios.
- Insertar propuestas directamente en la tabla (saltándose validación y límites).

## Aplicar la migración

Requiere la CLI de Supabase (se usa con `npx`, no hace falta instalarla).

### En local (recomendado primero)

Necesita Docker Desktop.

```bash
npx supabase init          # solo la primera vez: crea supabase/config.toml, conserva migrations/
npx supabase start         # levanta Postgres + API en local y aplica las migraciones
npx supabase test db       # ejecuta las pruebas de seguridad
```

Para conectar la app al Supabase local, `npx supabase status` muestra la URL y
la anon key: van en `.env.local` (ver `.env.example`).

### En el proyecto real

```bash
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>
npx supabase db push       # aplica las migraciones pendientes; muestra cuáles antes de aplicarlas
```

`db push` no borra datos, pero conviene revisar siempre lo que va a aplicar.

## Dar rol de revisor

Los roles no se asignan desde la app. Tras crear el usuario en
Authentication > Users, en el SQL Editor:

```sql
insert into public.editorial_roles (user_id, role)
values ('<uuid-del-usuario>', 'admin');
```

## Límite de envíos: qué hay y qué falta

Implementado:

- Cloudflare Turnstile verificado en el servidor (Edge Function `submit-song`) antes de guardar nada.
- Máximo 5 propuestas cada 10 minutos por origen (IP en hash SHA-256) y 200 por hora en total.
- Máximo 30 consultas de seguimiento cada 10 minutos por origen y 3000 por hora en total.
- Tamaño máximo de la propuesta: 64 KB. Título, letra, nombre y correo validados.
- Reintento seguro: el mismo envío repetido devuelve el mismo código y no se guarda dos veces.
- Los registros del límite se borran a las 24 horas.

Pendiente:

- Detección de spam (enlaces, repetición de contenido).

## Datos personales que recoge este sistema

Para redactar la política de privacidad:

- **Nombre** del colaborador: opcional, hasta 80 caracteres.
- **Correo** del colaborador: opcional, solo para responderle. Nunca es público,
  no aparece en el seguimiento ni en la canción publicada.
- **Hash SHA-256 de la IP** del envío: solo para limitar abusos, se borra a las 24 horas.
- **Contenido de la propuesta**: la canción enviada.
- **Código de seguimiento** y **hash del token de edición**: no identifican a nadie.

No se pide dirección, teléfono, fecha de nacimiento ni ningún otro dato.

Para atender una solicitud de borrado, se vacían `contributor_name` y
`contributor_email` de la propuesta (la fila se conserva si ya produjo una
versión publicada).

## Importar las canciones incluidas (fase posterior)

Aún no se hace. Cuando toque, cada canción se insertará con su `id` actual
(`songToRow` en `src/catalog/supabaseSongRepository.ts` produce la fila exacta)
y su versión 1 en `song_versions`. La importación usará la clave
`service_role` desde un script local, nunca desde el navegador ni desde Git.
