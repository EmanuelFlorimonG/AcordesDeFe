# Colaboración entre Codex y Claude Code

Estas reglas se aplican al trabajo de ambos agentes en este repositorio. `CLAUDE.md` complementa este archivo para Claude Code. Si las instrucciones parecen contradictorias, detener la edición afectada y consultar al usuario.

## Ramas y worktrees

- `main` es la rama estable. El checkout `Genesaret/` se usa para consulta y para integraciones autorizadas expresamente por el usuario.
- Codex trabaja exclusivamente en `Genesaret-codex/`, rama `codex/work`.
- Claude Code trabaja exclusivamente en `Genesaret-claude/`, rama `claude/work`.
- Antes de editar, comprobar la rama y el estado con `git status --short --branch` y verificar los worktrees con `git worktree list`.
- Ningún agente hace push directo a `main`, merge a `main`, cambios en su checkout ni despliegues sin autorización explícita del usuario.
- Ningún agente modifica, limpia, restablece o borra el worktree, la rama o los archivos del otro agente sin autorización del usuario.

## Alcance y coordinación

- Acordar un responsable por tarea y por área compartida antes de cambios simultáneos. Comunicar los archivos previstos, contratos afectados y dependencias entre tareas.
- Evitar ediciones simultáneas de `src/App.tsx`, `src/app/`, `src/types/`, `src/catalog/`, `src/admin/`, `src/components/Admin/`, `src/index.css` y configuraciones compartidas. Coordinar primero cualquier cambio de rutas, tipos, esquema, API o formato de almacenamiento.
- Los cambios en `supabase/migrations/`, autenticación, permisos, `package.json`, `package-lock.json` y `.github/workflows/deploy.yml` requieren autorización previa y explícita del usuario antes de editar. Esto incluye archivos de autenticación o permisos en frontend, Edge Functions y SQL.
- Cada agente puede revisar en modo lectura los commits y diffs del otro. Debe comunicar los hallazgos al autor y no editar directamente el worktree ajeno. Integrar cambios entre ramas solo tras revisar el diff y coordinar con el otro agente.

## Verificación y entrega

- Antes de terminar una tarea, ejecutar las pruebas correspondientes al cambio. Para cambios generales usar, según corresponda, `npm run lint`, `npm test` y `npm run build`. Para cambios de base de datos, ejecutar también `npx supabase test db` cuando el entorno local esté disponible.
- Informar los comandos ejecutados, sus resultados y cualquier prueba que no se haya podido ejecutar. No presentar una prueba pendiente como aprobada.
- Entregar un resumen de archivos modificados, pruebas, resultados, riesgos y estado de Git. La integración en `main` y cualquier despliegue requieren autorización explícita del usuario.
