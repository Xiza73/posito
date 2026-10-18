---
name: deploy
description: Pasos para desplegar Ventalia POS a producción en Vercel (región gru1) con Supabase de producción, incluidas las migraciones Drizzle, el alta de bodegas y el release dev → master con tag. Úsalo cuando el usuario pida desplegar, publicar, hacer release o correr migraciones en producción.
---

# Deploy de Ventalia POS

## Arquitectura

| Pieza | Producción | Desarrollo |
|---|---|---|
| App | Vercel, funciones en **`gru1` (São Paulo)** (`vercel.json`) | `bun dev` local |
| Base de datos | Proyecto Supabase **separado** (`sa-east-1`) | Proyecto Supabase de desarrollo |
| Rama que despliega | **solo `master`** (`ignoreCommand` en `vercel.json` omite el resto) | — |

- Región de funciones = región de la DB: cada consulta cruzaría el continente si quedara en `iad1` (default de Vercel).
- No hay previews por ahora: necesitarían su propia DB y orígenes de auth. Se agregan cuando haga falta.
- El build lo corre CI y Vercel; **nunca** localmente.

## Tienda online pública (`/tienda/*`)

Es la única parte sin login. No tiene rate limit en código: configura en **Vercel Firewall** una regla de rate-limit para la ruta `/tienda/*` (por IP) antes de publicar el enlace de una tienda.

## Variables en Vercel (solo entorno *Production*)

| Variable | Valor |
|---|---|
| `DATABASE_URL` | URI del **Transaction pooler** (puerto 6543) del Supabase de **producción** |
| `BETTER_AUTH_SECRET` | Secreto **nuevo**, distinto al de desarrollo |
| `BETTER_AUTH_URL` | URL pública de producción (ej. `https://posito.vercel.app`) |

`DIRECT_URL` **no** va en Vercel: solo se usa para migrar desde la máquina del administrador.

## Migraciones en producción

Se corren desde la máquina del administrador, con la URL de producción **solo para ese comando** (las variables del proceso ganan a `.env.local`; nunca se guarda la URL de producción en archivos):

```powershell
$env:DIRECT_URL = "<session pooler 5432 de PRODUCCIÓN>"; bun run db:migrate; Remove-Item Env:DIRECT_URL
```

- **Nunca** `drizzle-kit push`.
- Migración destructiva o con valor de enum nuevo (ver CLAUDE.md §7): revisar antes y tener backup.

## Release (dev → master)

1. `dev` con CI en verde.
2. PR `dev` → `master` con el resumen del release; merge con **merge commit** (`gh pr merge <n> --merge`, sin borrar `dev`).
3. Aplicar migraciones pendientes en producción **antes** de que termine el deploy de Vercel (o justo antes del merge si la migración es compatible hacia atrás).
4. Tag semver sobre `master`:

```bash
git switch master && git pull
git tag -a vX.Y.Z -m "release: vX.Y.Z"
git push origin vX.Y.Z
```

5. Verificación: abrir la URL, login, cobrar una venta de prueba y anularla.

## Rollback

- App: en Vercel → Deployments → "Promote" del deploy anterior.
- DB: las migraciones no se revierten solas; escribir una migración inversa.

Antes de cualquier paso irreversible (migrar producción, merge a `master`, tag), mostrar el resumen y **esperar confirmación explícita**.
