import { Button } from '@patternfly/react-core';
import { Bug } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { selectDebugMode, setDebugMode } from '../redux/slices/userSettings';

export function DebugToggle() {
  const dispatch = useAppDispatch();
  const debugMode = useAppSelector(selectDebugMode);

  return (
    <Button
      variant="plain"
      size="sm"
      className={`!p-1.5 ${debugMode ? 'text-yellow-500' : 'text-muted-foreground'}`}
      onClick={() => dispatch(setDebugMode(!debugMode))}
      aria-label={debugMode ? 'Disable debug mode' : 'Enable debug mode'}
    >
      <Bug className="w-4 h-4" />
    </Button>
  );
}
