import { Label } from '@patternfly/react-core';
import { useAgentHealth } from '../../hooks/useAgentHealth';

const HEALTH: Record<
  'healthy' | 'unhealthy' | 'unknown',
  { text: string; color: 'green' | 'red' | 'grey' }
> = {
  healthy: { text: 'Agent: healthy', color: 'green' },
  unhealthy: { text: 'Agent: offline', color: 'red' },
  unknown: { text: 'Agent: unknown', color: 'grey' },
};

export function SidebarFooter() {
  const { status } = useAgentHealth();
  const { text, color } = HEALTH[status];
  return (
    <div className="app-sidebar-footer">
      <Label isCompact variant="outline" color={color}>
        {text}
      </Label>
    </div>
  );
}
