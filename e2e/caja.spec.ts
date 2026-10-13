import { expect, test } from '@playwright/test'

test('sin sesión, /caja redirige al inicio de sesión', async ({ page }) => {
  await page.goto('/caja')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible()
  await expect(page.getByLabel('Correo')).toBeVisible()
  await expect(page.getByLabel('Contraseña')).toBeVisible()
})
