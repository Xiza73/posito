# Ventalia POS (posito)

## 1. Contexto del proyecto

Ventalia es un **punto de venta (POS) web para bodegas y minimarkets en Perú**. Reemplaza el cuaderno y la calculadora por una caja rápida, con control de stock, historial de ventas y cobro en efectivo, Yape/Plin o tarjeta.

- Moneda: soles (`PEN`, formato `S/ 9.10`). Locale `es-PE`.
- Precios **con IGV incluido (18 %)**: `igv = total - total / 1.18`.
- Dinero SIEMPRE en **céntimos enteros** (`number` entero) en lógica y base de datos; se formatea solo en la UI con `formatPEN`.
- Diseño de referencia: variante **Nube**, temas **Cielo** y **Café**, responsive para **escritorio, tablet y móvil**.

## 2. Usuarios y alcance (MVP)

**Usuarios**
- **Administrador/a**: gestiona productos, inventario, usuarios, configuración y ve reportes.
- **Cajero/a**: usa la caja, registra clientes y consulta ventas propias.

**MVP (las 8 secciones)**
| Sección | Mínimo viable |
|---|---|
| Inicio | Resumen del día: ventas, ticket promedio, productos con stock bajo |
| Caja | Búsqueda/escaneo, categorías, ticket, cobro (efectivo, Yape/Plin, tarjeta), vaciar |
| Ventas | Historial filtrable, detalle, anulación (solo admin) |
| Productos | CRUD, categoría, precio, código de barras, unidad |
| Inventario | Stock por producto, ajustes manuales, alerta de stock bajo |
| Clientes | Registro básico (nombre, DNI/RUC, teléfono); "Cliente: público general" por defecto |
| Usuarios | Alta/baja de cajeros, roles admin/cajero |
| Configuración | Datos del negocio y la sucursal, tema Cielo/Café |

**Fuera del MVP**: facturación electrónica SUNAT, multi-sucursal real, modo offline/PWA, impresora térmica, integración real con pasarelas de pago.

## 3. Stack y herramientas

| Área | Herramienta |
|---|---|
| Package manager / runtime de scripts | **bun** (nunca npm/yarn/pnpm) |
| Framework | Next.js 15 (App Router, Turbopack) + React 19 |
| Lenguaje | TypeScript estricto |
| Estilos | Tailwind CSS 4 (tokens en `@theme`, temas vía `data-theme` en `<html>`) |
| Lint + formato | Biome |
| Unit/componentes | Vitest + React Testing Library + jest-dom |
| E2E | Playwright (proyectos: escritorio, tablet, movil) |
| Base de datos | Supabase **solo como Postgres** + Drizzle ORM |
| Auth | Better Auth (plugins `admin` y `organization` para roles y sucursales) |

## 4. Comandos clave

```bash
bun install            # dependencias
bun dev                # servidor de desarrollo (http://localhost:3000)
bun run build          # build de producción
bun run lint           # biome check
bun run lint:fix       # biome check --write
bun run typecheck      # tsc --noEmit
bun run test           # vitest (unit + componentes)
bun run test:e2e       # playwright
```

Puerta antes de commit: `bun run lint && bun run typecheck && bun run test`.
Puerta antes de push a rama compartida: además `bun run build`.

## 5. Convenciones de código

- **Server Components por defecto**; `'use client'` solo en el componente hoja que necesita interactividad.
- **Mutaciones con Server Actions**, validadas con Zod en el borde (nunca confiar en el cliente para precios ni totales: el servidor recalcula).
- React 19 + Compiler: **no** usar `useMemo`/`useCallback` por costumbre.
- Lógica de negocio en **funciones puras** (`features/*/lib`) y testeadas; los componentes solo orquestan.
- Sin dependencias nuevas sin justificar: primero stdlib/plataforma (`Intl`, `<dialog>`, CSS).
- Nombres: componentes `PascalCase.tsx`, utilidades `kebab-case.ts`, tests junto al archivo (`*.test.ts`).
- Rutas y textos de UI en **español neutro** (tuteo, sin regionalismos); identificadores de código en inglés.
- Estilo de código: lo define Biome (2 espacios, comillas simples, sin punto y coma). No discutir formato: `bun run lint:fix`.
- Accesibilidad mínima: botones reales, `label` en inputs, `aria-label` en botones de solo ícono, foco visible.

## 6. Estructura del repositorio

Single-package. Arquitectura **por feature** (screaming architecture):

```
src/
├── app/                    # Solo routing (delgado): layouts, pages, route handlers
│   └── (app)/              # Rutas con el shell (sidebar): caja, ventas, productos…
├── features/<feature>/     # caja, ventas, productos, inventario, clientes, usuarios…
│   ├── components/
│   ├── actions.ts          # Server Actions de la feature
│   ├── lib/                # Lógica pura + tests
│   └── data/               # Queries Drizzle / mocks
├── components/             # UI compartida (shell, botones, inputs)
├── lib/                    # Utilidades transversales (format, db, auth)
└── db/                     # Esquema Drizzle y migraciones
e2e/                        # Specs de Playwright
```

Regla: una feature **no importa** de otra feature; lo compartido sube a `components/` o `lib/`.

## 7. Integraciones externas

- **Supabase (Postgres)**: conexión vía `DATABASE_URL` (pooler, transaction mode). No se usa el cliente `@supabase/supabase-js` ni Supabase Auth.
- **Drizzle ORM**: esquema en `src/db/schema.ts`, migraciones con `bunx drizzle-kit generate` / `migrate`.
- **Better Auth**: tablas en nuestro propio esquema Drizzle. Roles: `admin`, `cajero`. Sucursal = `organization`.
- Variables en `.env.local` (plantilla en `.env.example`). **Nunca** commitear secretos.

## 8. Reglas de trabajo con Claude

**Hacer**
- Seguir el flujo git del equipo: rama `feat/*`|`fix/*`|`chore/*` desde `dev` → PR a `dev` → `dev` → `master` solo en releases (skills `git-flow`, `github-pr`, `delivery-handoff`).
- Conventional Commits: `<type>(<scope>): <subject>`, ≤ 72 caracteres, imperativo, en minúsculas.
- Proponer el mensaje de commit y **esperar el OK** antes de commitear.
- Escribir o actualizar un test cuando se toca lógica de dinero, stock o permisos.
- Verificar en código o en docs antes de afirmar algo técnico.

**NO hacer**
- No usar npm/yarn/pnpm ni agregar lockfiles distintos de `bun.lock`.
- No usar floats para dinero.
- No commitear `.env*` (salvo `.env.example`), `CLAUDE.local.md` ni `.claude/settings.local.json`.
- No hacer push directo a `dev` ni a `master`; no hacer squash ni rebase de ramas compartidas.
- No agregar atribución de IA en commits, PRs ni docs.
- No usar voseo ni regionalismos en textos del producto.
