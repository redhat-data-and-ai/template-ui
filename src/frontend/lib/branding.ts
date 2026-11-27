export type BrandingPalette = {
  primary?: string;
  accent?: string;
  background?: string;
  foreground?: string;
};

type Mode = 'light' | 'dark';

const DARK_TEXT = '#1a1a1a';
const LIGHT_TEXT = '#ffffff';

const BRANDING_PROPS = [
  '--app-accent',
  '--app-accent-hover',
  '--app-on-accent',
  '--app-accent-strong',
  '--app-link',
  '--app-page-bg',
  '--app-surface-raised',
  '--app-text',
] as const;

function parseHex(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Whichever of near-black / white has the higher WCAG contrast against `hex`. */
export function pickOnColor(hex: string): '#1a1a1a' | '#ffffff' {
  const rgb = parseHex(hex);
  if (!rgb) return DARK_TEXT;
  const l = luminance(rgb);
  const withDark = contrast(l, luminance(parseHex(DARK_TEXT)!));
  const withLight = contrast(l, luminance(parseHex(LIGHT_TEXT)!));
  return withLight > withDark ? LIGHT_TEXT : DARK_TEXT;
}

/** Subtle raised surface: 4% toward black (light) or 6% toward white (dark). */
export function deriveSurface(backgroundHex: string, mode: Mode): string {
  const rgb = parseHex(backgroundHex);
  if (!rgb) return backgroundHex;
  const target = mode === 'light' ? 0 : 255;
  const amount = mode === 'light' ? 0.04 : 0.06;
  const mixed = rgb.map((v) => Math.round(v + (target - v) * amount));
  return '#' + mixed.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function clearBrandingColors(root: HTMLElement): void {
  BRANDING_PROPS.forEach((p) => root.style.removeProperty(p));
}

export function applyBrandingColors(
  palette: BrandingPalette | undefined,
  mode: Mode,
  root: HTMLElement,
): void {
  if (!palette) return;
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  if (palette.primary) {
    set('--app-accent', palette.primary);
    set('--app-accent-hover', palette.primary);
    set('--app-on-accent', pickOnColor(palette.primary));
  }
  if (palette.accent) {
    set('--app-accent-strong', palette.accent);
    set('--app-link', palette.accent);
  }
  if (palette.background) {
    set('--app-page-bg', palette.background);
    set('--app-surface-raised', deriveSurface(palette.background, mode));
  }
  if (palette.foreground) set('--app-text', palette.foreground);
}
