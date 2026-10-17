import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LineTotalEditor } from './line-total-editor'

function setup(over: { autoCents?: number; manualCents?: number | null } = {}) {
  const onChange = vi.fn()
  render(
    <LineTotalEditor
      name="Inca Kola"
      autoCents={over.autoCents ?? 1000}
      manualCents={over.manualCents ?? null}
      onChange={onChange}
    />,
  )
  return onChange
}

const open = () => userEvent.click(screen.getByRole('button', { name: /editar el precio total/i }))
const input = () => screen.getByLabelText('Precio total de Inca Kola')

describe('LineTotalEditor', () => {
  afterEach(cleanup)

  it('Enter aplica un cambio menor al 50 %', async () => {
    const onChange = setup()
    await open()
    await userEvent.clear(input())
    await userEvent.type(input(), '8.50{Enter}')
    expect(onChange).toHaveBeenCalledExactlyOnceWith(850)
  })

  it('Esc cancela sin aplicar', async () => {
    const onChange = setup()
    await open()
    await userEvent.clear(input())
    await userEvent.type(input(), '8{Escape}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Precio total de Inca Kola')).toBeNull()
  })

  it('un precio inválido (0) muestra error y no aplica', async () => {
    const onChange = setup()
    await open()
    await userEvent.clear(input())
    await userEvent.type(input(), '0{Enter}')
    expect(screen.getByRole('alert').textContent).toMatch(/S\/ 0\.01/)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('un cambio de más de 50 % pide confirmación', async () => {
    const onChange = setup()
    await open()
    await userEvent.clear(input())
    await userEvent.type(input(), '4{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/más de 50 %/)
    await userEvent.click(screen.getByRole('button', { name: /sí, cambiar/i }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith(400)
  })

  it('cancelar la confirmación no aplica', async () => {
    const onChange = setup()
    await open()
    await userEvent.clear(input())
    await userEvent.type(input(), '30{Enter}')
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('escribir el precio automático equivale a restablecer', async () => {
    const onChange = setup({ manualCents: 700 })
    await open()
    await userEvent.clear(input())
    await userEvent.type(input(), '10{Enter}')
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null)
  })
})
