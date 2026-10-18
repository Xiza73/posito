import { describe, expect, it } from 'vitest'
import { storeSettingsSchema } from './schemas'

const base = { storeEnabled: true, hasWhatsapp: true, storeSlug: 'Mi-Bodega ', storeHours: '' }

describe('storeSettingsSchema', () => {
  it('normaliza el slug y deja el horario vacío como null', () => {
    const r = storeSettingsSchema.parse(base)
    expect(r.storeSlug).toBe('mi-bodega')
    expect(r.storeHours).toBeNull()
  })

  it('exige slug para activar y lo permite vacío si está apagada', () => {
    expect(storeSettingsSchema.safeParse({ ...base, storeSlug: '' }).success).toBe(false)
    const off = storeSettingsSchema.parse({ ...base, storeEnabled: false, storeSlug: '' })
    expect(off.storeSlug).toBeNull()
  })

  it('rechaza reservados, formato inválido, horario largo y caracteres invisibles', () => {
    expect(storeSettingsSchema.safeParse({ ...base, storeSlug: 'admin' }).success).toBe(false)
    expect(storeSettingsSchema.safeParse({ ...base, storeSlug: 'a b' }).success).toBe(false)
    expect(storeSettingsSchema.safeParse({ ...base, storeHours: 'x'.repeat(201) }).success).toBe(
      false,
    )
    expect(storeSettingsSchema.safeParse({ ...base, storeHours: 'a‮b' }).success).toBe(false)
  })
})
