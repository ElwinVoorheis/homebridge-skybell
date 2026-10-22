import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Read from disk: Vitest replaces CSS imports with empty modules.
const css = readFileSync(join(import.meta.dirname, 'theme.css'), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!match?.[1]) throw new Error(`token --color-${name} missing`);
  return match[1];
}

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme tokens (NFR-5, AC-17)', () => {
  it('uses the specified colours', () => {
    expect([token('bg'), token('surface'), token('text'), token('muted')]).toEqual([
      '#0f1115',
      '#1a1d23',
      '#e6e8eb',
      '#a0a6b0',
    ]);
    expect([token('accent'), token('error')]).toEqual(['#4da3ff', '#ff6b6b']);
  });

  it.each([
    ['text', 'bg'],
    ['text', 'surface'],
    ['muted', 'bg'],
    ['muted', 'surface'],
    ['accent', 'bg'],
    ['accent', 'surface'],
    ['error', 'bg'],
    ['error', 'surface'],
    ['on-accent', 'accent'],
  ])('%s on %s meets WCAG AA 4.5:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });
});
