---
description: Despliega Ventalia POS (preview o producción) siguiendo el skill deploy
argument-hint: "[preview | produccion]  (por defecto: preview)"
allowed-tools: Read, Bash(git status:*), Bash(git log:*), Bash(git fetch:*), Bash(bun run:*)
---

Despliega al entorno: ${ARGUMENTS:-preview}.

Sigue al pie de la letra el skill **deploy** (`.claude/skills/deploy/SKILL.md`).
Antes de cualquier paso irreversible (migraciones en producción, promover a producción, crear un tag), muestra el resumen y ESPERA confirmación explícita.
