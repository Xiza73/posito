---
description: Revisión de código del diff actual (o de un PR) contra las convenciones de CLAUDE.md
argument-hint: "[número de PR | rama]  (vacío = cambios locales)"
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git log:*), Bash(gh pr view:*), Bash(gh pr diff:*)
---

Revisa los cambios de: $ARGUMENTS (si está vacío, usa `git diff dev...HEAD` más los cambios sin commitear).

1. Obtén el diff. Si es un PR: `gh pr diff $ARGUMENTS`.
2. Delega la revisión al subagente **code-reviewer** pasándole el diff y la lista de archivos.
3. Si el diff toca `src/db/`, `src/lib/auth*`, Server Actions (`actions.ts`) o `.env*`, delega también al subagente **security-auditor**.
4. Corre la puerta local y reporta los exit codes:
   `bun run lint; bun run typecheck; bun run test`
5. Responde con:
   - **Bloqueantes** (bugs, dinero con floats, permisos, totales calculados en el cliente)
   - **Sugerencias** (legibilidad, convenciones)
   - **Tests faltantes**

No apliques cambios: solo reporta. Si el usuario lo pide, aplica los bloqueantes después.
