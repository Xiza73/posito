---
name: deploy
description: Pasos para desplegar Ventalia POS (Next.js + bun) a preview o producción, incluidas las migraciones Drizzle sobre Supabase. Úsalo cuando el usuario pida desplegar, publicar, hacer release o correr migraciones en un entorno remoto.
---

# Deploy de Ventalia POS

> PERSONALIZAR: proveedor de hosting. Por defecto se asume **Vercel** (integración Git: `dev` → preview, `master` → producción).

## 1. Pre-checks (siempre)

```bash
git status                      # árbol limpio
git fetch origin
bun install --frozen-lockfile
bun run lint && bun run typecheck && bun run test
bun run build                   # puerta de build: lo mismo que corre CI
```

Si algún comando sale con exit ≠ 0, DETENTE y reporta.

## 2. Variables de entorno

Verifica que el entorno destino tenga: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (ver `.env.example`). No las imprimas.

## 3. Migraciones de base de datos

```bash
bunx drizzle-kit generate       # solo si hay cambios de esquema sin migración
bunx drizzle-kit migrate        # contra la DATABASE_URL del entorno destino
```

- **Nunca** usar `drizzle-kit push` contra producción.
- Migraciones destructivas (DROP, cambios de tipo): pedir confirmación y tener un backup de Supabase.

## 4. Despliegue

- **Preview**: push de la rama (`feat/*` → PR a `dev`). Vercel crea el preview automáticamente.
- **Producción**: PR `dev` → `master` (skill `git-flow`), merge `--no-ff` y luego el tag:

```bash
git tag -a vX.Y.Z -m "release: vX.Y.Z" && git push origin vX.Y.Z
```

## 5. Verificación post-deploy

```bash
BASE_URL=<url-del-deploy> bunx playwright test --project=escritorio
```

Smoke manual: login, abrir la caja, agregar un producto y cobrar en efectivo.

## Rollback

Vercel: "Promote" del deploy anterior. Las migraciones no se revierten solas: escribe una migración inversa.
