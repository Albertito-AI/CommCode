import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'test/browser',
  timeout: 60000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results',
  use: { browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
});
