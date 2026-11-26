import { Label } from '@patternfly/react-core';
import { useAgentHealth } from '../../hooks/useAgentHealth';

const HEALTH: Record<
  'healthy' | 'unhealthy' | 'unknown',
  { text: string; color: 'green' | 'red' | 'grey' }
> = {
  healthy: { text: 'Agent: Healthy', color: 'green' },
  unhealthy: { text: 'Agent: Unhealthy', color: 'red' },
  unknown: { text: 'Agent: Unknown', color: 'grey' },
};

export function SidebarFooter() {
  const { status } = useAgentHealth();
  const { text, color } = HEALTH[status];
  return (
    <div className="app-sidebar-footer">
      <Label isCompact color={color}>
        {text}
      </Label>
    </div>
  );
}
