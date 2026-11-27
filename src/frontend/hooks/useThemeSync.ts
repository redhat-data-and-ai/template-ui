import { useEffect } from 'react';
import { useAppSelector } from '../redux/hooks';
import { selectTheme } from '../redux/slices/userSettings';

/**
 * Syncs the Redux theme state to DOM classes on <html>.
 * Dark mode is the single PatternFly class `.pf-v6-theme-dark`.
 */
export function useThemeSync(): void {
  const theme = useAppSelector(selectTheme);

  useEffect(() => {
    const html = document.documentElement;

    html.classList.toggle('pf-v6-theme-dark', theme === 'dark');
  }, [theme]);
}
