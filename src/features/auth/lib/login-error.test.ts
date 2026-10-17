import { describe, expect, it } from 'vitest'
import { INVALID_CREDENTIALS_MESSAGE, loginErrorMessage, RATE_LIMITED_MESSAGE } from './login-error'

describe('loginErrorMessage', () => {
  it('429 muestra el mensaje de demasiados intentos', () => {
    expect(loginErrorMessage({ status: 429 })).toBe(RATE_LIMITED_MESSAGE)
  })

  it('401 u otros estados muestran credenciales incorrectas', () => {
    expect(loginErrorMessage({ status: 401 })).toBe(INVALID_CREDENTIALS_MESSAGE)
    expect(loginErrorMessage({ status: 500 })).toBe(INVALID_CREDENTIALS_MESSAGE)
    expect(loginErrorMessage({})).toBe(INVALID_CREDENTIALS_MESSAGE)
    expect(loginErrorMessage(null)).toBe(INVALID_CREDENTIALS_MESSAGE)
  })
})
