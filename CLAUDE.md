# Instrucciones para Claude Code

Lee también `AGENTS.md`; sus reglas de colaboración se aplican a Claude Code. Este archivo concreta el trabajo de Claude y no sustituye esas reglas.

## Lugar de trabajo

- Trabaja exclusivamente en `Genesaret-claude/`, rama `claude/work`.
- Codex trabaja exclusivamente en `Genesaret-codex/`, rama `codex/work`.
- `main` es la rama estable. No modifiques su checkout, no hagas push directo ni merge a `main`, y no despliegues sin autorización explícita del usuario.
- No modifiques, limpies, restablezcas ni borres el worktree de Codex.
- Antes de editar, comprueba la rama y el estado con `git status --short --branch` y los worktrees con `git worktree list`. Si no estás en `claude/work`, detén la edición y comunícalo.

## Coordinación y cambios protegidos

- Puedes revisar en modo lectura los commits y diffs de Codex. Comunica los hallazgos a Codex o al usuario; no corrijas archivos directamente en `Genesaret-codex/`.
- Coordina con Codex las áreas compartidas y los cambios de contratos, tipos, rutas, esquema, API o formato de almacenamiento antes de editarlos simultáneamente.
- Solicita autorización previa y explícita del usuario antes de modificar `supabase/migrations/`, autenticación, permisos, `package.json`, `package-lock.json` o `.github/workflows/deploy.yml`. La regla también cubre autenticación o permisos en frontend, Edge Functions y SQL.

## Cierre de cada tarea

- Ejecuta las pruebas correspondientes antes de terminar. Para cambios generales usa, según corresponda, `npm run lint`, `npm test` y `npm run build`; para cambios de base de datos, también `npx supabase test db` si está disponible el entorno local.
- Reporta los archivos modificados, las pruebas ejecutadas y sus resultados, las pruebas pendientes, los riesgos y el estado de Git.
