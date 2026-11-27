import { describe, it, expect } from 'vitest';
import {
  pickOnColor,
  deriveSurface,
  applyBrandingColors,
  clearBrandingColors,
} from './branding';

function lum(hex: string) {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('pickOnColor', () => {
  it.each([
    ['#f8a390', '#1a1a1a'],
    ['#0066cc', '#ffffff'],
    ['#4dabf7', '#1a1a1a'],
    ['#f2f2f2', '#1a1a1a'],
    ['#151515', '#ffffff'],
  ])('%s -> %s', (input, expected) => {
    expect(pickOnColor(input)).toBe(expected);
  });
});

describe('deriveSurface', () => {
  it('light: differs from input but stays subtle', () => {
    const s = deriveSurface('#ffffff', 'light');
    expect(s).not.toBe('#ffffff');
    expect(ratio(s, '#ffffff')).toBeLessThan(1.2);
  });
  it('dark: lighter than input', () => {
    const s = deriveSurface('#151515', 'dark');
    expect(lum(s)).toBeGreaterThan(lum('#151515'));
  });
});

describe('applyBrandingColors / clearBrandingColors', () => {
  it('sets nothing for undefined palette', () => {
    const el = document.createElement('div');
    applyBrandingColors(undefined, 'light', el);
    expect(el.style.length).toBe(0);
  });
  it('maps primary only', () => {
    const el = document.createElement('div');
    applyBrandingColors({ primary: '#0066cc' }, 'light', el);
    expect(el.style.getPropertyValue('--app-accent')).toBe('#0066cc');
    expect(el.style.getPropertyValue('--app-accent-hover')).toBe('#0066cc');
    expect(el.style.getPropertyValue('--app-on-accent')).toBe('#ffffff');
    expect(el.style.getPropertyValue('--app-page-bg')).toBe('');
  });
  it('maps all keys', () => {
    const el = document.createElement('div');
    applyBrandingColors(
      { primary: '#0066cc', accent: '#a60000', background: '#ffffff', foreground: '#1a1a1a' },
      'light',
      el,
    );
    expect(el.style.getPropertyValue('--app-accent-strong')).toBe('#a60000');
    expect(el.style.getPropertyValue('--app-link')).toBe('#a60000');
    expect(el.style.getPropertyValue('--app-page-bg')).toBe('#ffffff');
    expect(el.style.getPropertyValue('--app-surface-raised')).toBe(deriveSurface('#ffffff', 'light'));
    expect(el.style.getPropertyValue('--app-text')).toBe('#1a1a1a');
  });
  it('clear removes everything apply can set', () => {
    const el = document.createElement('div');
    applyBrandingColors(
      { primary: '#0066cc', accent: '#a60000', background: '#ffffff', foreground: '#1a1a1a' },
      'dark',
      el,
    );
    clearBrandingColors(el);
    expect(el.style.length).toBe(0);
  });
});
