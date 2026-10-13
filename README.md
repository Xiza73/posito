# Ventalia POS

Punto de venta web para bodegas y minimarkets en Perú: caja rápida, inventario, ventas, clientes y usuarios con roles.

**Stack:** Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · Drizzle + Supabase (Postgres) · Better Auth · bun

## Desarrollo

```bash
bun install
cp .env.example .env.local   # completa las variables
bun dev
```

| Comando | Qué hace |
|---|---|
| `bun run lint` | Biome (lint + formato) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | Vitest |
| `bun run test:e2e` | Playwright (escritorio, tablet, móvil) |
| `bun run build` | Build de producción |

Convenciones y reglas del equipo: ver [CLAUDE.md](CLAUDE.md).
