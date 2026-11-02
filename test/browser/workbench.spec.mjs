import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../src/server.mjs';
import { token } from '../../src/security.mjs';

test('desktop and mobile: login, create, editor, tests, live preview and expense entry', async ({
  page,
}, testInfo) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'commcode-browser-')),
    key = token();
  const app = await createApp({ root, token: key, mode: 'process', port: 0, previewPort: 0 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(app.url);
    await page.locator('#token').fill(key);
    await page.locator('#login-form button').click();
    await expect(page.locator('#workbench')).toBeVisible();
    await page.locator('#project-name').fill('Community expense tracker');
    await page.locator('#create-form button').click();
    await expect(page.locator('#filename')).toHaveText('index.html');
    await expect(page.locator('.cm-editor')).toBeVisible();
    await page.locator('.cm-content').press('ControlOrMeta+End');
    await page.keyboard.insertText('\n<!-- Browser verification -->\n');
    await page.locator('#save').click();
    await expect(page.locator('#dirty')).toHaveText('');
    await page.locator('#test').click();
    await expect(page.locator('#job-status')).toHaveText('Command passed');
    await page.locator('#start').click();
    await expect(page.locator('#preview-status')).toHaveText('HTTP response verified');
    const frame = page.frameLocator('#preview');
    await frame.locator('#description').fill('Workshop materials');
    await frame.locator('#amount').fill('12.50');
    await frame.getByRole('button', { name: 'Add expense', exact: true }).click();
    await expect(frame.locator('#total')).toHaveText('12.50');
    await page.screenshot({ path: testInfo.outputPath('workbench-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.screenshot({ path: testInfo.outputPath('workbench-mobile.png'), fullPage: true });
    await page.locator('#stop').click();
    await expect(page.locator('#preview-status')).toHaveText('Stopped');
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
