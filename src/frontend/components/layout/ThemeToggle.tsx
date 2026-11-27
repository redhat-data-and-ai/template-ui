import { Button, Tooltip } from '@patternfly/react-core';
import { MoonIcon, SunIcon } from '@patternfly/react-icons';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { selectTheme, toggleTheme } from '../../redux/slices/userSettings';

export function ThemeToggle() {
  const dispatch = useAppDispatch();
  const isDark = useAppSelector(selectTheme) === 'dark';
  const label = `Switch to ${isDark ? 'light' : 'dark'} mode`;

  return (
    <Tooltip content={label} position="bottom">
      <Button
        variant="plain"
        aria-label={label}
        icon={isDark ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
        onClick={() => dispatch(toggleTheme())}
      />
    </Tooltip>
  );
}
