---
description: Workflow para resolver un bug a partir de un issue de GitHub (rama, test que falla, fix, PR a dev)
argument-hint: "<número de issue>"
allowed-tools: Read, Edit, Write, Grep, Glob, Bash(gh issue view:*), Bash(git checkout -b:*), Bash(git status:*), Bash(git diff:*), Bash(bun run:*), Bash(bunx vitest:*)
---

Resuelve el issue #$ARGUMENTS siguiendo este flujo:

1. **Entender**: `gh issue view $ARGUMENTS`. Resume el bug, los pasos para reproducirlo y el comportamiento esperado. Si falta información, pregunta y DETENTE.
2. **Rama**: `git checkout -b fix/<slug-corto> dev`.
3. **Reproducir con un test que falla** (Vitest para lógica en `src/features/*/lib`, Playwright en `e2e/` si es de flujo UI). Córrelo y confirma que falla por la razón correcta.
4. **Causa raíz**: localiza el origen (no el síntoma). Explícala en 1–2 líneas.
5. **Fix mínimo**: el cambio más chico que hace pasar el test sin romper otros.
6. **Puerta**: `bun run lint; bun run typecheck; bun run test` (revisa los exit codes, no solo el resumen).
7. **Entrega** (skill `delivery-handoff`): propone el commit `fix(<scope>): <subject>` con `Closes #$ARGUMENTS` en el body, y ESPERA el OK antes de commitear, pushear y abrir el PR a `dev`.
