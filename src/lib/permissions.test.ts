import { describe, expect, it } from 'vitest'
import { roleLabel, roles } from './permissions'

describe('roles', () => {
  it('cajero no tiene permisos de negocio', () => {
    expect(roles.cajero.authorize({ product: ['create'] }).success).toBe(false)
    expect(roles.cajero.authorize({ stock: ['adjust'] }).success).toBe(false)
    expect(roles.cajero.authorize({ sale: ['void'] }).success).toBe(false)
    expect(roles.cajero.authorize({ sale: ['approve'] }).success).toBe(false)
    expect(roles.cajero.authorize({ report: ['view'] }).success).toBe(false)
  })

  it('cajero registra y corrige clientes, pero no los desactiva', () => {
    expect(roles.cajero.authorize({ customer: ['create'] }).success).toBe(true)
    expect(roles.cajero.authorize({ customer: ['update'] }).success).toBe(true)
    expect(roles.cajero.authorize({ customer: ['delete'] }).success).toBe(false)
  })

  it('admin y owner gestionan clientes (incluido desactivar)', () => {
    expect(roles.admin.authorize({ customer: ['create', 'update', 'delete'] }).success).toBe(true)
    expect(roles.owner.authorize({ customer: ['create', 'update', 'delete'] }).success).toBe(true)
  })

  it('cajero no gestiona miembros', () => {
    expect(roles.cajero.authorize({ member: ['create'] }).success).toBe(false)
    expect(roles.cajero.authorize({ member: ['update'] }).success).toBe(false)
  })

  it('admin tiene permisos de negocio y gestiona miembros', () => {
    expect(roles.admin.authorize({ product: ['create', 'update', 'delete'] }).success).toBe(true)
    expect(roles.admin.authorize({ sale: ['void'] }).success).toBe(true)
    expect(roles.admin.authorize({ sale: ['approve'] }).success).toBe(true)
    expect(roles.admin.authorize({ stock: ['adjust'] }).success).toBe(true)
    expect(roles.admin.authorize({ member: ['create'] }).success).toBe(true)
  })

  it('owner tiene todo, incluso eliminar la organization', () => {
    expect(roles.owner.authorize({ organization: ['delete'] }).success).toBe(true)
    expect(roles.owner.authorize({ report: ['view'] }).success).toBe(true)
    expect(roles.owner.authorize({ sale: ['approve'] }).success).toBe(true)
  })

  it('solo owner y admin pueden actualizar la organization (Configuración); cajero no', () => {
    expect(roles.owner.authorize({ organization: ['update'] }).success).toBe(true)
    expect(roles.admin.authorize({ organization: ['update'] }).success).toBe(true)
    expect(roles.cajero.authorize({ organization: ['update'] }).success).toBe(false)
  })

  it('admin no puede eliminar la organization', () => {
    expect(roles.admin.authorize({ organization: ['delete'] }).success).toBe(false)
  })
})

describe('roleLabel', () => {
  it('traduce roles conocidos y deja pasar los desconocidos', () => {
    expect(roleLabel('cajero')).toBe('Cajero/a')
    expect(roleLabel('otro')).toBe('otro')
  })
})
