import { Label } from '@patternfly/react-core';
import { useAgentHealth } from '../../hooks/useAgentHealth';

type Health = 'healthy' | 'unhealthy' | 'unknown';

const HEALTH: Record<Health, { text: string; color: 'green' | 'red' | 'grey' }> = {
  healthy: { text: 'Healthy', color: 'green' },
  unhealthy: { text: 'Unhealthy', color: 'red' },
  unknown: { text: 'Unknown', color: 'grey' },
};

export function SidebarFooter() {
  const { status } = useAgentHealth();
  const { text, color } = HEALTH[status];
  return (
    <div className="app-sidebar-footer" data-health={status}>
      <span className="app-sidebar-footer__text">{'Agent: '}</span>
      <Label color={color} isCompact>
        {text}
      </Label>
    </div>
  );
}
