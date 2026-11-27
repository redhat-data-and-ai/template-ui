import { useEffect } from 'react';
import { useAppSelector } from '../redux/hooks';
import { selectTheme } from '../redux/slices/userSettings';

/**
 * Syncs the Redux theme state to DOM classes on <html>.
 * Applies both Tailwind's `.dark` and PatternFly's `.pf-v6-theme-dark`.
 */
export function useThemeSync(): void {
  const theme = useAppSelector(selectTheme);

  useEffect(() => {
    const html = document.documentElement;

    if (theme === 'dark') {
      html.classList.add('dark', 'pf-v6-theme-dark');
    } else {
      html.classList.remove('dark', 'pf-v6-theme-dark');
    }
  }, [theme]);
}
