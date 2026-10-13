import { expect, test } from '@playwright/test'

test('la caja carga y muestra el ticket actual', async ({ page }) => {
  await page.goto('/caja')
  await expect(page.getByRole('heading', { name: 'Caja' })).toBeVisible()
})
