import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CustomerBar } from './customer-bar'

const juan = {
  id: 'c1',
  name: 'Juan Pérez',
  documentType: 'dni' as const,
  documentNumber: '12345678',
  phone: null,
}

describe('CustomerBar', () => {
  // Sin globals de vitest, RTL no limpia el DOM solo entre pruebas
  afterEach(cleanup)

  it('sin cliente ofrece cambiar y no muestra "Quitar"', async () => {
    const onPick = vi.fn()
    render(<CustomerBar customer={null} disabled={false} onPick={onPick} onClear={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /público general/i }))
    expect(onPick).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: /quitar/i })).toBeNull()
  })

  it('con cliente muestra nombre y documento, y "Quitar" vuelve a público general', async () => {
    const onClear = vi.fn()
    render(<CustomerBar customer={juan} disabled={false} onPick={vi.fn()} onClear={onClear} />)

    expect(screen.getByText('Juan Pérez')).toBeTruthy()
    expect(screen.getByText(/DNI 12345678/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /quitar cliente juan pérez/i }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('con el ticket congelado no se puede cambiar ni quitar', () => {
    render(<CustomerBar customer={juan} disabled onPick={vi.fn()} onClear={vi.fn()} />)
    for (const b of screen.getAllByRole('button'))
      expect((b as HTMLButtonElement).disabled).toBe(true)
  })
})
