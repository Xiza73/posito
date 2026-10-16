'use client'

import { useActionState } from 'react'
import { Field, INPUT } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { type BusinessProfile, DEFAULT_RECEIPT_FOOTER } from '@/lib/business-profile'
import { type BusinessProfileState, updateBusinessProfileAction } from '../actions'
import { BUSINESS_LIMITS } from '../lib/schemas'

const INITIAL: BusinessProfileState = { ok: false }

/** Tarjeta "Datos del negocio": lo que sale en el menú y en el encabezado y pie de la boleta. */
export function BusinessProfileForm({ profile }: { profile: BusinessProfile }) {
  const [state, action] = useActionState(updateBusinessProfileAction, INITIAL)
  const fe = state.fieldErrors ?? {}
  const v = state.values

  return (
    <section
      aria-labelledby="business-profile-title"
      className="flex max-w-3xl flex-col gap-4 rounded-card border border-line bg-surface p-5 md:p-6"
    >
      <div className="flex flex-col gap-1">
        <h3 id="business-profile-title" className="font-semibold">
          Datos del negocio
        </h3>
        <p className="text-muted text-sm">
          Aparecen en el menú y en las boletas nuevas. Las boletas ya emitidas conservan los datos
          que tenían al cobrar.
        </p>
      </div>

      <form
        // Remonta si cambian los valores guardados para que los campos muestren lo vigente
        key={JSON.stringify(profile)}
        action={action}
        className="grid gap-3.5 sm:grid-cols-2 sm:items-start"
      >
        <Field id="bp-trade" label="Nombre comercial" error={fe.tradeName?.[0]}>
          <input
            id="bp-trade"
            name="tradeName"
            required
            maxLength={BUSINESS_LIMITS.tradeName}
            autoComplete="off"
            defaultValue={v?.tradeName ?? profile.tradeName}
            className={INPUT}
          />
        </Field>
        <Field id="bp-branch" label="Sucursal" error={fe.branchName?.[0]} hint="Opcional">
          <input
            id="bp-branch"
            name="branchName"
            maxLength={BUSINESS_LIMITS.branchName}
            autoComplete="off"
            defaultValue={v?.branchName ?? profile.branchName ?? ''}
            className={INPUT}
          />
        </Field>
        <Field
          id="bp-legal"
          label="Razón social"
          error={fe.legalName?.[0]}
          hint="Obligatoria si ingresas un RUC"
        >
          <input
            id="bp-legal"
            name="legalName"
            maxLength={BUSINESS_LIMITS.legalName}
            autoComplete="off"
            defaultValue={v?.legalName ?? profile.legalName ?? ''}
            className={INPUT}
          />
        </Field>
        <Field id="bp-ruc" label="RUC" error={fe.ruc?.[0]} hint="Opcional · 11 dígitos">
          <input
            id="bp-ruc"
            name="ruc"
            inputMode="numeric"
            maxLength={20}
            autoComplete="off"
            defaultValue={v?.ruc ?? profile.ruc ?? ''}
            className={`${INPUT} font-mono`}
          />
        </Field>
        <Field id="bp-address" label="Dirección" error={fe.address?.[0]} hint="Opcional">
          <input
            id="bp-address"
            name="address"
            maxLength={BUSINESS_LIMITS.address}
            autoComplete="off"
            defaultValue={v?.address ?? profile.address ?? ''}
            className={INPUT}
          />
        </Field>
        <Field id="bp-phone" label="Teléfono" error={fe.phone?.[0]} hint="Opcional">
          <input
            id="bp-phone"
            name="phone"
            type="tel"
            maxLength={BUSINESS_LIMITS.phone}
            autoComplete="off"
            defaultValue={v?.phone ?? profile.phone ?? ''}
            className={INPUT}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            id="bp-footer"
            label="Mensaje al pie de la boleta"
            error={fe.receiptFooter?.[0]}
            hint={`Si lo dejas vacío se usa "${DEFAULT_RECEIPT_FOOTER}"`}
          >
            <input
              id="bp-footer"
              name="receiptFooter"
              maxLength={BUSINESS_LIMITS.receiptFooter}
              autoComplete="off"
              defaultValue={v?.receiptFooter ?? profile.receiptFooter}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <SubmitButton
            pendingLabel="Guardando…"
            className="h-11 rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
          >
            Guardar
          </SubmitButton>
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
