---
name: security-review
description: Checklist de seguridad para Ventalia POS (Next.js Server Actions, Better Auth, Drizzle/Postgres, dinero). Úsalo cuando se toque autenticación, roles, Server Actions, queries a la base de datos, cobros, variables de entorno, o cuando el usuario pida una revisión de seguridad.
---

# Revisión de seguridad — Ventalia POS

Revisa el diff (o los archivos indicados) contra este checklist. Reporta cada hallazgo con `archivo:línea`, severidad (CRÍTICA/ALTA/MEDIA/BAJA), escenario de explotación y fix sugerido.

## Autenticación y autorización (Better Auth)
- [ ] Cada Server Action y Route Handler obtiene la sesión en el servidor (`auth.api.getSession({ headers })`) y falla si no hay.
- [ ] Las acciones de admin (anular venta, CRUD de usuarios y productos, ajustes de stock) verifican `role === 'admin'` **en el servidor**, nunca solo ocultando el botón.
- [ ] Los datos se filtran por la `organization` (sucursal) de la sesión: un cajero no lee ventas de otra sucursal.
- [ ] `BETTER_AUTH_SECRET` solo en el servidor; nada sensible con prefijo `NEXT_PUBLIC_`.

## Dinero e integridad de ventas
- [ ] El servidor **recalcula** precios, subtotal, IGV y total desde la DB; ignora los montos enviados por el cliente.
- [ ] Montos en céntimos enteros; sin `parseFloat` sobre dinero.
- [ ] Venta y descuento de stock en **una sola transacción** (`db.transaction`); stock no negativo garantizado por un `CHECK` en la DB.
- [ ] Anulaciones registradas (quién, cuándo, motivo); no se borran ventas.

## Entrada de datos
- [ ] Todo input de Server Action validado con Zod (`safeParse`) antes de usarse.
- [ ] Queries con el query builder de Drizzle o `sql` con parámetros; nunca concatenar strings en SQL.
- [ ] Sin `dangerouslySetInnerHTML` con datos de usuario.

## Configuración
- [ ] `.env*` fuera de git (salvo `.env.example`).
- [ ] Sin secretos en logs ni en mensajes de error devueltos al cliente.
- [ ] Dependencias nuevas justificadas; revisar `bun pm ls` ante paquetes sospechosos.

Para una auditoría profunda, delega al subagente **security-auditor**.
