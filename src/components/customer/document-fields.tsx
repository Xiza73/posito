'use client'

import { useState } from 'react'
import { Field, INPUT } from '@/components/ui/field'
import { DOCUMENT_TYPES, type DocumentType } from '@/lib/document'

const TYPE_NAMES: Record<DocumentType, string> = {
  dni: 'DNI',
  ruc: 'RUC',
  ce: 'Carné de extranjería',
}

const HINTS: Record<DocumentType, string> = {
  dni: '8 dígitos',
  ruc: '11 dígitos',
  ce: '9 a 12 letras o números',
}

const MAX_LENGTH: Record<DocumentType, number> = { dni: 8, ruc: 11, ce: 12 }

type Props = {
  /** Prefijo para los `id` (varios formularios pueden convivir en la página). */
  idPrefix: string
  defaultType?: string
  defaultNumber?: string
  typeError?: string
  numberError?: string
}

const isDocumentType = (v: string): v is DocumentType =>
  (DOCUMENT_TYPES as readonly string[]).includes(v)

/**
 * Tipo + número de documento (opcionales, pero van juntos). Los campos se llaman
 * `documentType` y `documentNumber`; la validación real es del servidor (src/lib/document.ts).
 */
export function DocumentFields({
  idPrefix,
  defaultType = '',
  defaultNumber = '',
  typeError,
  numberError,
}: Props) {
  const [type, setType] = useState(defaultType)
  const known = isDocumentType(type) ? type : null

  return (
    <div className="grid gap-3.5 sm:grid-cols-[minmax(0,11rem)_1fr]">
      <Field id={`${idPrefix}-doc-type`} label="Documento" error={typeError}>
        <select
          id={`${idPrefix}-doc-type`}
          name="documentType"
          value={type}
          onChange={(e) => setType(e.currentTarget.value)}
          className={INPUT}
        >
          <option value="">Sin documento</option>
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_NAMES[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field
        id={`${idPrefix}-doc-number`}
        label="Número"
        error={numberError}
        hint={known ? HINTS[known] : 'Opcional'}
      >
        <input
          id={`${idPrefix}-doc-number`}
          name="documentNumber"
          inputMode={known === 'ce' || known === null ? 'text' : 'numeric'}
          maxLength={known ? MAX_LENGTH[known] + 4 : 20}
          autoComplete="off"
          defaultValue={defaultNumber}
          className={`${INPUT} font-mono`}
        />
      </Field>
    </div>
  )
}
