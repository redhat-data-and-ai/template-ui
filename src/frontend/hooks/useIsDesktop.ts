import { useMediaQuery } from './useMediaQuery';

/** PatternFly `xl` breakpoint: at and above it the sidebar is inline, below it an overlay. */
export const DESKTOP_QUERY = '(min-width: 75rem)';

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY, true);
}
