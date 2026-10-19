'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Field, INPUT } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import type { StoreSettings } from '@/lib/store-settings'
import { type StoreSettingsState, updateStoreSettingsAction } from '../actions'
import { STORE_HOURS_MAX } from '../lib/schemas'

const INITIAL: StoreSettingsState = { ok: false }

const TOGGLE =
  'relative h-6 w-11 flex-none rounded-full border border-line bg-surface-2 transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-4.5 after:rounded-full after:bg-muted after:transition-transform peer-checked:border-accent peer-checked:bg-accent peer-checked:after:translate-x-5 peer-checked:after:bg-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2'

function Toggle({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="peer sr-only" />
      <span aria-hidden="true" className={TOGGLE} />
      <span className="font-medium">{label}</span>
    </label>
  )
}

/** Tarjeta "Tienda online": catálogo público con pedido por WhatsApp. */
export function StoreSettingsForm({
  settings,
  publishedCount,
  phoneIsValid,
  hasPhone,
}: {
  settings: StoreSettings
  /** Productos activos con "Mostrar en tienda" (calculado en el servidor). */
  publishedCount: number
  /** El teléfono del negocio es un celular peruano válido para WhatsApp. */
  phoneIsValid: boolean
  hasPhone: boolean
}) {
  const [state, action] = useActionState(updateStoreSettingsAction, INITIAL)
  const fe = state.fieldErrors ?? {}
  const v = state.values
  const [slug, setSlug] = useState(v?.storeSlug ?? settings.storeSlug ?? '')
  const previewSlug = slug.trim().toLowerCase() || 'mi-bodega'

  return (
    <section
      aria-labelledby="store-title"
      className="flex max-w-3xl flex-col gap-4 rounded-card border border-line bg-surface p-5 md:p-6"
    >
      <div className="flex flex-col gap-1">
        <h3 id="store-title" className="font-semibold">
          Tienda online
        </h3>
        <p className="text-muted text-sm">
          Un catálogo público (sin login) con tus productos visibles, precios y disponibilidad. Los
          clientes arman su pedido y te lo envían por WhatsApp; no se guarda ninguna venta ni dato
          del cliente. Nunca se muestra la cantidad exacta de stock.
        </p>
      </div>

      <p className="text-sm">
        Se publicarán <strong>{publishedCount}</strong>{' '}
        {publishedCount === 1 ? 'producto' : 'productos'} (activos con «Mostrar en tienda»). Los
        productos existentes aparecen por defecto: desmarca la opción en los que no quieras mostrar.
      </p>

      {!phoneIsValid ? (
        <p role="alert" className="rounded-ctl border border-warn p-3 text-sm">
          {hasPhone
            ? 'El teléfono del negocio no es un celular válido para WhatsApp (9 dígitos que empiezan con 9, con +51 opcional).'
            : 'Falta el teléfono del negocio.'}{' '}
          Corrígelo en «Datos del negocio»: sin un celular válido la tienda no se publica.
        </p>
      ) : null}

      <form
        key={JSON.stringify(settings)}
        action={action}
        className="grid gap-3.5 sm:grid-cols-2 sm:items-start"
      >
        <div className="flex flex-col gap-3 sm:col-span-2">
          <Toggle
            name="storeEnabled"
            label="Tienda online activa"
            checked={v?.storeEnabled ?? settings.storeEnabled}
          />
          <Toggle
            name="hasWhatsapp"
            label="Tengo WhatsApp (recibo pedidos en el teléfono del negocio)"
            checked={v?.hasWhatsapp ?? settings.hasWhatsapp}
          />
        </div>

        <div className="sm:col-span-2">
          <Field
            id="st-slug"
            label="Dirección de la tienda"
            error={fe.storeSlug?.[0]}
            hint={`Se verá como /tienda/${previewSlug}`}
          >
            <input
              id="st-slug"
              name="storeSlug"
              maxLength={60}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <Toggle
            name="metroDeliveryEnabled"
            label="Entrega en estación del Metropolitano"
            checked={v?.metroDeliveryEnabled ?? settings.metroDeliveryEnabled}
          />
          <p className="pl-14 text-muted text-xs">
            Gratis; el cliente indica la estación y coordinan día y hora por WhatsApp
          </p>
        </div>

        <div className="sm:col-span-2">
          <Field
            id="st-hours"
            label="Horario de atención"
            error={fe.storeHours?.[0]}
            hint="Opcional · ej. Lun a Sáb 8:00 a 21:00"
          >
            <input
              id="st-hours"
              name="storeHours"
              maxLength={STORE_HOURS_MAX}
              autoComplete="off"
              defaultValue={v?.storeHours ?? settings.storeHours ?? ''}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <SubmitButton
            pendingLabel="Guardando…"
            className="h-11 rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
          >
            Guardar
          </SubmitButton>
          {settings.storeSlug ? (
            <Link
              href={`/tienda/${settings.storeSlug}`}
              target="_blank"
              className="text-accent text-sm underline"
            >
              Ver mi tienda
            </Link>
          ) : null}
        </div>

        {state.error ? (
          <p role="alert" className="text-bad text-sm sm:col-span-2">
            {state.error}
          </p>
        ) : null}
        {state.ok && state.message ? (
          <p role="status" className="text-ok text-sm sm:col-span-2">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  )
}
