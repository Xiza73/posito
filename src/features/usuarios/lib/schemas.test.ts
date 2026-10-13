import { describe, expect, it } from 'vitest'
import { changeRoleSchema, createCashierSchema } from './schemas'

const valid = {
  name: 'Luis Quispe',
  email: 'Luis@Bodega.pe ',
  password: '12345678',
  role: 'cajero',
}

describe('createCashierSchema', () => {
  it('acepta datos válidos y normaliza el correo', () => {
    const r = createCashierSchema.safeParse(valid)
    expect(r.success).toBe(true)
    expect(r.data?.email).toBe('luis@bodega.pe')
  })

  it('recorta el nombre y exige 2 a 80 caracteres', () => {
    expect(createCashierSchema.safeParse({ ...valid, name: ' A ' }).success).toBe(false)
    expect(createCashierSchema.safeParse({ ...valid, name: 'a'.repeat(81) }).success).toBe(false)
    expect(createCashierSchema.safeParse({ ...valid, name: '  Ana  ' }).data?.name).toBe('Ana')
  })

  it('rechaza correos inválidos', () => {
    expect(createCashierSchema.safeParse({ ...valid, email: 'no-es-correo' }).success).toBe(false)
  })

  it('exige contraseña de al menos 8 caracteres', () => {
    expect(createCashierSchema.safeParse({ ...valid, password: '1234567' }).success).toBe(false)
  })

  it('no permite asignar owner ni roles desconocidos', () => {
    expect(createCashierSchema.safeParse({ ...valid, role: 'owner' }).success).toBe(false)
    expect(createCashierSchema.safeParse({ ...valid, role: 'root' }).success).toBe(false)
    expect(createCashierSchema.safeParse({ ...valid, role: 'admin' }).success).toBe(true)
  })
})

describe('changeRoleSchema', () => {
  it('acepta admin y cajero', () => {
    expect(changeRoleSchema.safeParse({ memberId: 'abc', role: 'admin' }).success).toBe(true)
    expect(changeRoleSchema.safeParse({ memberId: 'abc', role: 'cajero' }).success).toBe(true)
  })

  it('rechaza owner y memberId vacío', () => {
    expect(changeRoleSchema.safeParse({ memberId: 'abc', role: 'owner' }).success).toBe(false)
    expect(changeRoleSchema.safeParse({ memberId: '', role: 'admin' }).success).toBe(false)
  })
})
