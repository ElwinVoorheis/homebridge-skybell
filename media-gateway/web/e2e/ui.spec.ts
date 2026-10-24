import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const devices = [
  {
    id: 'front',
    name: 'Front door',
    mediaKinds: ['video-stream', 'photo'],
    rtspUrl: 'rtsp://nvr.lan:8554/front',
  },
  {
    id: 'side',
    name: 'Side gate',
    mediaKinds: ['video-stream', 'photo'],
    rtspUrl: 'rtsp://nvr.lan:8554/side',
  },
  { id: 'back', name: 'Back yard', mediaKinds: ['photo'], rtspUrl: null },
];
// 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

async function mockServer(page: Page): Promise<{ photoCalls: () => number }> {
  let photos = 0;
  await page.route('**/api/devices', (route) => route.fulfill({ json: devices }));
  await page.route('**/api/devices/*/media/photo', (route) => {
    photos++;
    return route.fulfill({ body: PNG, contentType: 'image/png' });
  });
  // No media server in this test: the player shows its failure state.
  await page.route('**/webrtc/**', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('**/hls/**', (route) => route.fulfill({ status: 404, body: '' }));
  return { photoCalls: () => photos };
}

async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test.describe('at 360 px (AC-18)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('device list is one column without sideways scroll', async ({ page }) => {
    await mockServer(page);
    await page.goto('/');
    const tiles = page.locator('.tile-grid > li');
    await expect(tiles).toHaveCount(3);

    const lefts = await tiles.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
    expect(new Set(lefts).size).toBe(1);
    await expectNoSidewaysScroll(page);
  });

  test('device screen has no sideways scroll', async ({ page }) => {
    await mockServer(page);
    await page.goto('/devices/front');
    await expect(page.getByRole('heading', { name: 'Front door' })).toBeVisible();
    await expect(page.getByRole('img', { name: /latest snapshot/i })).toBeVisible();

    await expectNoSidewaysScroll(page);
  });
});

test.describe('at 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('device list is a grid of tiles (NFR-6)', async ({ page }) => {
    await mockServer(page);
    await page.goto('/');
    const tiles = page.locator('.tile-grid > li');
    await expect(tiles).toHaveCount(3);

    const lefts = await tiles.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
    expect(new Set(lefts).size).toBeGreaterThan(1);
    await expectNoSidewaysScroll(page);
  });

  test('both screens pass an automated WCAG 2.2 AA scan (AC-17)', async ({ page }) => {
    await mockServer(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Front door' })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto('/devices/front');
    await expect(page.getByRole('alert').filter({ hasText: 'Live video unavailable' })).toBeVisible(
      {
        timeout: 15_000,
      },
    );
    await expectNoAxeViolations(page);
  });

  test('every control works with the keyboard and shows a focus ring (AC-17)', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const server = await mockServer(page);
    await page.goto('/');

    // List: Tab to the first device and open it with Enter.
    await expect(page.getByRole('link', { name: 'Front door' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Front door' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Front door' })).toBeVisible();
    await expect(page.getByRole('img', { name: /latest snapshot/i })).toBeVisible();

    const focusAndCheck = async (name: string | RegExp): Promise<void> => {
      const target = page.getByRole('button', { name });
      for (
        let i = 0;
        i < 15 && !(await target.evaluate((el) => el === document.activeElement));
        i++
      ) {
        await page.keyboard.press('Tab');
      }
      await expect(target).toBeFocused();
      const outline = await target.evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(outline).not.toBe('none');
    };

    await focusAndCheck('Copy RTSP address');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Copied')).toBeVisible();

    const before = server.photoCalls();
    await focusAndCheck('Refresh snapshot');
    await page.keyboard.press('Space');
    await expect.poll(server.photoCalls).toBe(before + 1);
  });
});
