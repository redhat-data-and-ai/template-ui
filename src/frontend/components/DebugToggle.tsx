import { Button } from '@patternfly/react-core';
import { BugIcon } from '@patternfly/react-icons';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { selectDebugMode, setDebugMode } from '../redux/slices/userSettings';
import './dialogs.css';

export function DebugToggle() {
  const dispatch = useAppDispatch();
  const debugMode = useAppSelector(selectDebugMode);

  return (
    <Button
      variant="plain"
      size="sm"
      className={debugMode ? 'app-debug-toggle--on' : undefined}
      onClick={() => dispatch(setDebugMode(!debugMode))}
      aria-label={debugMode ? 'Disable debug mode' : 'Enable debug mode'}
      aria-pressed={debugMode}
      icon={<BugIcon />}
    />
  );
}
