import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClearFiltersButton } from './clear-filters-button'

let params = new URLSearchParams()
vi.mock('next/navigation', () => ({ useSearchParams: () => params }))

describe('ClearFiltersButton', () => {
  beforeEach(() => {
    params = new URLSearchParams()
  })

  it('no aparece sin filtros ni solo con la página', () => {
    const { rerender } = render(<ClearFiltersButton onClear={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull()

    params = new URLSearchParams('pagina=3')
    rerender(<ClearFiltersButton onClear={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull()
  })

  it('aparece con un filtro y llama a onClear', async () => {
    params = new URLSearchParams('metodo=efectivo&pagina=2')
    const onClear = vi.fn()
    render(<ClearFiltersButton onClear={onClear} />)

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(onClear).toHaveBeenCalledOnce()
  })
})
