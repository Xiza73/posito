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
| Auth | Better Auth (plugin `organization`: una organization = una bodega; roles en `member.role`) |
| DB en tests | PGlite (Postgres en WASM, en memoria): migraciones reales sin Docker |
| Lectura de .xlsx (cliente) | `read-excel-file` **9.3.10 fijada** (sin `^`): única forma razonable de leer .xlsx sin escribir un parser ZIP/XML; se carga con `import()` solo al importar |

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
bun run db:generate    # genera migración SQL desde src/db/schema.ts
bun run db:migrate     # aplica migraciones contra DATABASE_URL
bun run db:studio      # explorador de la DB
bun run bodega:create -- --nombre "Bodega X" --propietario "Ana Rojas" --email ana@x.pe   # alta de bodega (pide la contraseña por prompt)
bun run seed:productos -- --slug bodega-x   # productos de demostración en una bodega existente (omite nombres ya creados)
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
└── db/                     # schema.ts (dominio) + auth-schema.ts (generado por Better Auth)
drizzle/                    # Migraciones SQL generadas (no editar a mano)
e2e/                        # Specs de Playwright
```

Regla: una feature **no importa** de otra feature; lo compartido sube a `components/` o `lib/`.

## 7. Integraciones externas

- **Supabase (Postgres)**: conexión vía `DATABASE_URL` (pooler, transaction mode). No se usa el cliente `@supabase/supabase-js` ni Supabase Auth.
- **Drizzle ORM**: esquema en `src/db/schema.ts`, `casing: 'snake_case'`. Todo cambio de esquema → `bun run db:generate` + test en `src/db/schema.test.ts`. **Nunca** `drizzle-kit push` contra la nube.
  - Toda tabla de negocio lleva `organizationId`; **toda query filtra por la organization de la sesión**.
  - Cada page, loader o Server Action que lea o escriba datos de la bodega llama a `getCurrentMember()` (y `requirePermission` si aplica). El layout y el middleware NO bastan: el layout no se re-ejecuta en navegación cliente y el middleware es solo optimista.
  - Stock: `stock_movement` es la fuente de verdad (append-only); `product.stock` es caché que se actualiza en la **misma transacción**.
  - Cobro (`features/caja/data/checkout.ts`): UNA transacción; el servidor recalcula precios y totales (el cliente solo manda `{ saleId, paymentMethod, items: [{ productId, quantity }] }`). **Idempotente por `saleId`**: lo genera el cliente (`crypto.randomUUID()`), es la PK de `sale` y se conserva entre reintentos; si ya existe en la misma bodega se devuelve esa venta sin tocar stock. Los productos se leen con `FOR UPDATE` (sin sobreventa) y el stock insuficiente rechaza toda la venta.
  - Correlativo de boleta: tabla `receipt_series` (una fila por bodega), incrementada con un upsert atómico (`INSERT … ON CONFLICT DO UPDATE SET last_number = last_number + 1 RETURNING`) dentro del cobro. **Nunca `MAX(number)+1`** (carrera entre cobros). Serie y siguiente número se editan en Configuración (`organization:update`), que rechaza números ya emitidos.
  - Ventas (`features/ventas`): **anulación = inverso de los movimientos `venta` originales** de esa venta (movimientos `anulacion` con cantidad opuesta + `product.stock` en la misma transacción, `FOR UPDATE` de venta y productos), **nunca** derivado del `tracksStock` actual del producto. Solo dentro de 7 días (`createdAt >= now() - interval '7 days'`, validado en SQL), motivo obligatorio (`sale.voidReason`), permiso `sale:void`. El **cajero solo ve sus propias ventas** (lista, detalle, totales y CSV): se fuerza en la capa de datos (`features/ventas/data/sales.ts`), no en la UI. Fechas de negocio en hora de Lima vía `src/lib/lima-time.ts` (rangos `YYYY-MM-DD` → `[start, end)` UTC). El código de boleta/ticket compartido vive en `src/components/receipt/` y `src/lib/receipt-lines.ts` (el estado "anulada" siempre viene del servidor).
  - **CSV injection**: toda celda exportada que empiece con `=`, `+`, `-`, `@`, tab o CR se prefija con `'` (`csvCell` y `buildCsv` en `src/lib/csv.ts`, compartidos por Ventas e Inventario); importes con aritmética entera, nunca floats. El export (`/ventas/export`) usa los mismos filtros Zod que la página y responde 401 sin sesión.
  - **Inventario** (`features/inventario`): ingreso (una o varias líneas, máx. 200, duplicadas se unen), ajuste (+/- con motivo de lista; "Otro" = `Otro: …`) y conteo físico escriben `stock_movement` (+ `product.stock` en la misma transacción, productos `FOR UPDATE` por id). El **conteo calcula la diferencia contra el stock leído bajo el bloqueo**, jamás contra lo que vio el cliente (el cliente solo manda lo contado); si coincide no registra nada. **Sin movimientos sobre productos inactivos ni que no controlan stock** (el servidor los rechaza; reactivar primero) y el resultado de un ajuste no puede ser negativo (error amigable; el CHECK `product_stock_non_negative` es la última red). Permiso `stock:adjust` (owner/admin) para escribir; todos los roles ven stock, alertas e historial. Historial global con rango en hora de Lima (7 días por defecto, máx. 366), 50 por página; el enlace a la venta solo se ofrece si el visor puede abrirla. Export `/inventario/export` (401 sin sesión; los inactivos solo para quien tiene `stock:adjust`). `stockStatus`/`StockBadge` viven en `src/lib` y `src/components/ui`.
  - **Nombres únicos de categoría y producto** por bodega se comparan por `name_key` (`src/lib/name-key.ts`: NFC, trim, espacios colapsados, minúsculas y sin tildes salvo la `ñ`), con índices únicos `category_org_name_uq` y `product_org_name_key_uq`. Escribe SIEMPRE con `normalizeDisplayName` (→ `name`) y `nameKey` (→ `name_key`); nunca compares `name` a mano.
  - Integridad en la DB con `CHECK` (stock ≥ 0, subtotal + igv = total, línea = precio × cantidad).
  - **Validación de ventas** (`organization_settings.requireSaleApproval`, leída con `getSettings`/`updateSettings` de `src/lib/settings.ts`; sin fila = apagada): la ACTION de cobro decide `requireApproval = settings.requireSaleApproval && !can(member.role, { sale: ['approve'] })` (lista blanca: un rol desconocido o compuesto queda pendiente) y se lo pasa a `checkout`; admin/owner nunca quedan pendientes y **nadie aprueba sus propias ventas**. Rechazar/anular envía `expectedStatus` y aborta si la venta cambió de estado. Una venta `pendiente` **descuenta stock y toma correlativo igual que una completada** (el cliente se lleva la mercadería); no suma a los importes (`salesSummary` solo suma `completada`; cuenta `pendingCount` aparte). `approveSale` (permiso `sale:approve`, `FOR UPDATE` de la venta) la pasa a `completada` y guarda `approvedById`/`approvedAt` (CHECK `sale_approval_consistent`: ambos nulos o ambos con valor). **Rechazar = `voidSale`** (permiso `sale:void`): devuelve el stock con los movimientos inversos y una `pendiente` se rechaza **sin ventana de 7 días** (la ventana solo aplica a `completada`). El contador del menú sale de `GET /ventas/pendientes` (`countPendingSales`, 0 si el rol no tiene `sale:approve`); sin tiempo real (sondeo cada 30 s + evento `ventas:pending-changed`).
  - **Migraciones con valores nuevos de enum**: el migrator de drizzle (`PgDialect.migrate`) corre TODAS las migraciones pendientes en UNA sola transacción, y Postgres no deja USAR un valor de enum en la misma transacción que lo agrega (`55P04 unsafe use of new value`). Por eso un `ALTER TYPE … ADD VALUE` (p. ej. `pendiente` en `0006`) no puede ir acompañado, en el mismo lote, de `CHECK`/`DEFAULT`/índices parciales/`UPDATE` que nombren el literal nuevo: exprésalo con los valores ya existentes o déjalo para una migración posterior (desplegada en otro `db:migrate`). Probado en `src/db/sale-pending-migration.test.ts`.
  - **Importación masiva** (`/productos` → Importar; `features/productos/lib/import-*.ts`, `data/import.ts`): CSV o .xlsx (no .xls), máx. 5 MB y 2000 filas, **parseo en el cliente** (evita el límite de cuerpo de las Server Actions); columnas por nombre (`nombre`, `precio`, `categoria`, `codigo_barras`, `stock`, `stock_minimo`, `controla_stock`). Vista previa sin escrituras (`previewImportAction`) y luego `commitImportAction`, que **re-valida y re-clasifica en el servidor dentro de UNA transacción** (nunca confía en la vista previa); una violación de unicidad concurrente revierte todo. Estados: Nueva / Ya existe (mismo `name_key`) / Repetida en el archivo (gana la primera) / Error. Un código de barras de otro producto es error. Los existentes se omiten salvo "Actualizar precio y categoría" (solo precio y categoría; categoría vacía = conservar). El stock del archivo **se suma** como movimiento `ingreso` con motivo "Importación" (solo si controla stock; en existentes, solo si se actualiza), jamás reemplaza el stock. Celdas numéricas de Excel: `numberToString` (sin artefactos de float). Permisos: `product:create` (+ `product:update` si actualiza).
- **Better Auth**: tablas generadas en `src/db/auth-schema.ts` con `bunx auth@latest generate --config src/lib/auth.ts --output src/db/auth-schema.ts --adapter drizzle --dialect pg --yes` (no editar a mano). Roles: `owner`/`admin`/`cajero` vía plugin `organization`.
  - **Sin registro público** (`disableSignUp: true`): las bodegas se crean con `bun run bodega:create` (invitación manual) y el owner/admin crea cajeros en Usuarios. Como `signUpEmail` también queda bloqueado en servidor, los usuarios se crean con `createUserWithPassword` (`src/lib/users.ts`, primitivas internas de Better Auth).
  - Permisos en `src/lib/permissions.ts` (`ac` + `roles`, compartido servidor/cliente). `owner` no es asignable desde la UI. Verificación real en servidor con `getCurrentMember()` / `requirePermission()` (`src/lib/session.ts`); el middleware solo hace un chequeo optimista de cookie.
  - La sesión nace con `activeOrganizationId` = primera membresía del usuario (hook `databaseHooks.session.create.before`).
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
- Los productos no se borran, se desactivan (`active = false`): hay ventas que los referencian. Caja solo lee productos activos.
- No commitear `.env*` (salvo `.env.example`), `CLAUDE.local.md` ni `.claude/settings.local.json`.
- No hacer push directo a `dev` ni a `master`; no hacer squash ni rebase de ramas compartidas.
- No agregar atribución de IA en commits, PRs ni docs.
- No usar voseo ni regionalismos en textos del producto.
