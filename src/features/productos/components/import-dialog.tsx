'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { formatCents } from '@/lib/format'
import { commitImportAction, previewImportAction } from '../actions'
import {
  decodeCsv,
  FIELD_LABELS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_TEMPLATE_CSV,
  type ParseResult,
  parseCsv,
  type RawImportRow,
  rowsFromSheet,
} from '../lib/import-parse'
import type { ImportPreview, ImportStatus, ImportSummary, PreviewRow } from '../lib/import-validate'

type Step =
  | { name: 'file' }
  | { name: 'preview'; rows: RawImportRow[]; preview: ImportPreview; fileName: string }
  | { name: 'result'; summary: ImportSummary }

const STATUS_LABEL: Record<ImportStatus, string> = {
  new: 'Nueva',
  existing: 'Ya existe',
  duplicate: 'Repetida en el archivo',
  error: 'Error',
}
const STATUS_STYLE: Record<ImportStatus, string> = {
  new: 'border-ok text-ok',
  existing: 'border-line text-muted',
  duplicate: 'border-warn text-warn',
  error: 'border-bad text-bad',
}
const STATUS_ORDER: ImportStatus[] = ['new', 'existing', 'duplicate', 'error']
const SHOWN_LIMIT = 200

const COLUMNS_HELP = [
  `${FIELD_LABELS.name} y ${FIELD_LABELS.price} (obligatorias)`,
  `${FIELD_LABELS.cost} (opcional, solo administración)`,
  FIELD_LABELS.category,
  FIELD_LABELS.barcode,
  FIELD_LABELS.stock,
  FIELD_LABELS.minStock,
  `${FIELD_LABELS.tracksStock} (sí/no)`,
].join(', ')

/** Lee el archivo elegido a filas crudas, o devuelve un mensaje amigable. */
async function readFile(file: File): Promise<ParseResult> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.xls')) {
    return { ok: false, error: 'Guarda el archivo como .xlsx o .csv' }
  }
  if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx')) {
    return { ok: false, error: 'Elige un archivo .csv o .xlsx' }
  }
  if (file.size > IMPORT_MAX_BYTES) {
    return { ok: false, error: 'El archivo pesa más de 5 MB' }
  }
  try {
    if (lower.endsWith('.csv')) {
      return rowsFromSheet(parseCsv(decodeCsv(await file.arrayBuffer())))
    }
    // Se carga bajo demanda: la librería de Excel solo pesa si alguien importa un .xlsx
    const { readSheet } = await import('read-excel-file/browser')
    return rowsFromSheet(await readSheet(file))
  } catch {
    return { ok: false, error: 'No se pudo leer el archivo. Revisa que no esté dañado.' }
  }
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [step, setStep] = useState<Step>({ name: 'file' })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Se monta solo al abrir: cada apertura empieza limpia
  useEffect(() => {
    const el = ref.current
    if (el && !el.open) el.showModal()
  }, [])

  function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    startTransition(async () => {
      const parsed = await readFile(file)
      if (!parsed.ok) {
        setError(parsed.error)
        return
      }
      const res = await previewImportAction(parsed.rows)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setStep({
        name: 'preview',
        rows: parsed.rows,
        preview: { counts: res.counts, rows: res.rows },
        fileName: file.name,
      })
    })
  }

  function onConfirm(rows: RawImportRow[], updateExisting: boolean) {
    setError(null)
    startTransition(async () => {
      const res = await commitImportAction({ rows, updateExisting })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setStep({ name: 'result', summary: res.summary })
    })
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Mientras corre una acción no se puede cerrar con Esc: el resultado se perdería
      onCancel={(e) => pending && e.preventDefault()}
      aria-labelledby="import-dialog-title"
      className="m-auto max-h-[92vh] w-[min(94vw,56rem)] overflow-auto rounded-card border border-line bg-surface p-6 text-ink shadow-pop backdrop:bg-black/40"
    >
      <div inert={pending} aria-busy={pending} className="flex flex-col gap-4">
        <h2 id="import-dialog-title" className="font-semibold text-lg">
          Importar productos
        </h2>

        {step.name === 'file' ? (
          <FileStep pending={pending} onFile={onFile} onClose={onClose} />
        ) : null}
        {step.name === 'preview' ? (
          <PreviewStep
            key={step.fileName}
            step={step}
            pending={pending}
            onConfirm={onConfirm}
            onBack={() => {
              setError(null)
              setStep({ name: 'file' })
            }}
          />
        ) : null}
        {step.name === 'result' ? <ResultStep summary={step.summary} onClose={onClose} /> : null}

        {error ? (
          <p role="alert" className="text-bad text-sm">
            {error}
          </p>
        ) : null}
      </div>
      {pending ? (
        <p role="status" className="mt-3 text-muted text-sm">
          Procesando…
        </p>
      ) : null}
    </dialog>
  )
}

function FileStep({
  pending,
  onFile,
  onClose,
}: {
  pending: boolean
  onFile: (file: File | undefined) => void
  onClose: () => void
}) {
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([IMPORT_TEMPLATE_CSV], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla-productos.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="flex flex-col gap-2 text-muted text-sm">
        <p>
          Sube un archivo <strong className="text-ink">.csv</strong> o{' '}
          <strong className="text-ink">.xlsx</strong> (hasta 5 MB y {IMPORT_MAX_ROWS} productos).
          Antes de guardar nada verás una vista previa.
        </p>
        <p>Columnas: {COLUMNS_HELP}. El orden no importa y las columnas extra se ignoran.</p>
        <p>
          El precio va en soles con IGV incluido (ej. 3.50). Excel borra los ceros iniciales de los
          códigos de barras: dale formato de texto a esa columna si los necesitas.
        </p>
        <button
          type="button"
          onClick={downloadTemplate}
          className="w-fit cursor-pointer text-accent underline underline-offset-2"
        >
          Descargar plantilla
        </button>
      </div>

      <div className="flex flex-col gap-1.5 text-muted text-sm">
        <label htmlFor="import-file">Archivo</label>
        <input
          id="import-file"
          type="file"
          accept=".csv,.xlsx"
          disabled={pending}
          onChange={(e) => {
            onFile(e.currentTarget.files?.[0])
            e.currentTarget.value = ''
          }}
          className="w-full rounded-ctl border border-line bg-page p-2 text-ink text-sm file:mr-3 file:cursor-pointer file:rounded-ctl file:border-0 file:bg-accent file:px-3 file:py-1.5 file:font-semibold file:text-accent-ink"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="h-10 cursor-pointer rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2"
        >
          Cancelar
        </button>
      </div>
    </>
  )
}

function PreviewStep({
  step,
  pending,
  onConfirm,
  onBack,
}: {
  step: Extract<Step, { name: 'preview' }>
  pending: boolean
  onConfirm: (rows: RawImportRow[], updateExisting: boolean) => void
  onBack: () => void
}) {
  const { counts, rows } = step.preview
  const [filter, setFilter] = useState<ImportStatus | null>(null)
  const [updateExisting, setUpdateExisting] = useState(false)

  const toImport = counts.new + (updateExisting ? counts.existing : 0)
  const visible = filter ? rows.filter((r) => r.status === filter) : rows

  return (
    <>
      <p className="text-muted text-sm">
        Archivo: <span className="text-ink">{step.fileName}</span>. Todavía no se guardó nada.
      </p>

      <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
        <legend className="sr-only">Filtrar por estado</legend>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            disabled={counts[s] === 0}
            onClick={() => setFilter(filter === s ? null : s)}
            className={`h-9 cursor-pointer rounded-full border px-3 text-sm disabled:cursor-default disabled:opacity-50 ${
              filter === s ? 'bg-accent-soft font-semibold' : ''
            } ${STATUS_STYLE[s]}`}
          >
            {counts[s]} {SUMMARY_LABEL[s]}
          </button>
        ))}
      </fieldset>

      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={updateExisting}
          onChange={(e) => setUpdateExisting(e.currentTarget.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        Actualizar precio, costo y categoría de los existentes
      </label>
      {updateExisting ? (
        <p className="-mt-2 text-muted text-xs">
          El stock del archivo se suma al actual (nunca lo reemplaza). El nombre, el código y el
          stock mínimo no cambian.
        </p>
      ) : null}

      <PreviewList rows={visible.slice(0, SHOWN_LIMIT)} />
      {visible.length > SHOWN_LIMIT ? (
        <p className="text-muted text-xs">
          Mostrando {SHOWN_LIMIT} de {visible.length}. Usa los filtros para ver el resto.
        </p>
      ) : null}
      {counts.error > 0 ? (
        <p className="text-muted text-xs">
          Las filas con error no se importan. Corrige el archivo y vuelve a subirlo.
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onBack}
          className="h-10 cursor-pointer rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2"
        >
          Elegir otro archivo
        </button>
        <button
          type="button"
          disabled={pending || toImport === 0}
          aria-disabled={pending || toImport === 0}
          onClick={() => onConfirm(step.rows, updateExisting)}
          className="h-10 cursor-pointer rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? 'Importando…'
            : `Importar ${toImport} ${toImport === 1 ? 'producto' : 'productos'}`}
        </button>
      </div>
    </>
  )
}

const SUMMARY_LABEL: Record<ImportStatus, string> = {
  new: 'nuevas',
  existing: 'existentes',
  duplicate: 'repetidas',
  error: 'con error',
}

const GRID =
  'md:grid md:grid-cols-[3rem_minmax(0,1fr)_8rem_6rem_4rem_10rem] md:items-start md:gap-3'

function PreviewList({ rows }: { rows: PreviewRow[] }) {
  return (
    <div className="overflow-hidden rounded-card border border-line">
      <div
        className={`hidden border-line border-b bg-surface-2 px-4 py-2 font-medium text-muted text-xs ${GRID}`}
        aria-hidden="true"
      >
        <span>Fila</span>
        <span>Nombre</span>
        <span>Categoría</span>
        <span className="text-right">Precio</span>
        <span className="text-right">Stock</span>
        <span>Estado</span>
      </div>
      <ul className="max-h-[40vh] divide-y divide-line overflow-auto">
        {rows.map((r) => (
          <li key={r.line} className={`flex flex-col gap-1 px-4 py-3 text-sm ${GRID}`}>
            <span className="font-mono text-muted text-xs md:pt-0.5">
              <span className="md:hidden">Fila </span>
              {r.line}
            </span>
            <span className="min-w-0 break-words font-medium">{r.name || '—'}</span>
            <span className="min-w-0 break-words text-muted">{r.category || '—'}</span>
            <span className="font-mono md:text-right">
              {r.priceCents === null ? r.price || '—' : formatCents(r.priceCents)}
            </span>
            <span className="font-mono md:text-right">{r.tracksStock ? r.stock || '0' : '—'}</span>
            <span className="flex min-w-0 flex-col items-start gap-1">
              <span
                className={`rounded-full border px-2 py-0.5 font-medium text-xs ${STATUS_STYLE[r.status]}`}
              >
                {STATUS_LABEL[r.status]}
              </span>
              {r.note ? <span className="text-muted text-xs">{r.note}</span> : null}
              {r.errors.map((e) => (
                <span key={e.field} className="text-bad text-xs">
                  {FIELD_LABELS[e.field]}: {e.message}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ResultStep({ summary, onClose }: { summary: ImportSummary; onClose: () => void }) {
  const lines = [
    [summary.created, 'productos creados'],
    [summary.updated, 'productos actualizados'],
    [summary.skipped, 'filas omitidas (existentes o repetidas)'],
    [summary.errors, 'filas con error (no se importaron)'],
  ] as const
  return (
    <>
      <div role="status" className="flex flex-col gap-1.5 text-sm">
        <p className="font-semibold">Importación terminada</p>
        <ul className="flex flex-col gap-1 text-muted">
          {lines.map(([n, label]) => (
            <li key={label}>
              <span className="font-mono text-ink">{n}</span> {label}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="h-10 cursor-pointer rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
        >
          Cerrar
        </button>
      </div>
    </>
  )
}
