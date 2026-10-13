import { defineConfig, devices } from '@playwright/test'

// Los 3 dispositivos objetivo del diseño: escritorio, tablet y móvil
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'], browserName: 'chromium' } },
    { name: 'movil', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'bun dev', url: 'http://localhost:3000', reuseExistingServer: true },
})
