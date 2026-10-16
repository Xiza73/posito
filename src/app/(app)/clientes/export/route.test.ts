// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const findCurrentMember = vi.fn()
const exportRows = vi.fn()

vi.mock('@/lib/session', () => ({ findCurrentMember: () => findCurrentMember() }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/features/clientes/data/customers', () => ({
  exportRows: (...args: unknown[]) => exportRows(...args),
}))

const { GET } = await import('./route')

const session = (role: string) => ({
  user: { id: 'u1' },
  member: { id: 'm1', role },
  organization: { id: 'org-1', name: 'Bodega' },
})

const call = (qs = '') => GET(new Request(`http://localhost/clientes/export${qs}`))

beforeEach(() => {
  findCurrentMember.mockReset()
  exportRows.mockReset()
  exportRows.mockResolvedValue({
    truncated: false,
    rows: [
      {
        name: 'Ana Rojas',
        documentType: 'dni',
        documentNumber: '12345678',
        phone: null,
        email: null,
        address: null,
        active: true,
        purchaseCount: 1,
        totalSpentCents: 600,
        lastPurchaseAt: null,
      },
    ],
  })
})

describe('GET /clientes/export', () => {
  it('sin sesión responde 401 y no consulta datos', async () => {
    findCurrentMember.mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(exportRows).not.toHaveBeenCalled()
  })

  it('un cajero recibe 403 y no consulta datos (datos personales: solo administración)', async () => {
    findCurrentMember.mockResolvedValue(session('cajero'))
    const res = await call()
    expect(res.status).toBe(403)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(exportRows).not.toHaveBeenCalled()
  })

  it('un rol desconocido también recibe 403', async () => {
    findCurrentMember.mockResolvedValue(session('otro'))
    expect((await call()).status).toBe(403)
    expect(exportRows).not.toHaveBeenCalled()
  })

  it('un administrador recibe el CSV con los filtros de la URL y la bodega de la sesión', async () => {
    findCurrentMember.mockResolvedValue(session('admin'))
    const res = await call('?q=ana&inactivos=1&orgId=otra')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="clientes-\d{4}-\d{2}-\d{2}\.csv"$/,
    )
    expect(exportRows).toHaveBeenCalledWith(
      {},
      {
        orgId: 'org-1',
        viewer: { userId: 'u1', role: 'admin' },
        query: 'ana',
        includeInactive: true,
      },
    )
    const body = await res.text()
    expect(body).toContain('Nombre,Tipo doc,Documento')
    expect(body).toContain('Ana Rojas,DNI,12345678')
  })

  it('el propietario también puede exportar; parámetros inválidos se descartan', async () => {
    findCurrentMember.mockResolvedValue(session('owner'))
    const res = await call(`?q=${'x'.repeat(500)}&inactivos=si`)
    expect(res.status).toBe(200)
    expect(exportRows).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ query: '', includeInactive: false }),
    )
  })
})
