import { defineConfig, devices } from '@playwright/test';

// CHROMIUM_PATH lets sandboxes with a preinstalled Chromium skip `npx playwright install`.
const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['Desktop Chrome'],
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
