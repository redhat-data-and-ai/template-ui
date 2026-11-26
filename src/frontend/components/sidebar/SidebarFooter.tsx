import { useAgentHealth } from '../../hooks/useAgentHealth';

const HEALTH: Record<'healthy' | 'unhealthy' | 'unknown', string> = {
  healthy: 'Agent: healthy',
  unhealthy: 'Agent: unhealthy',
  unknown: 'Agent: unknown',
};

export function SidebarFooter() {
  const { status } = useAgentHealth();
  return (
    <div className="app-sidebar-footer" data-health={status}>
      <span className="app-sidebar-footer__dot" aria-hidden="true" />
      <span className="app-sidebar-footer__text">{HEALTH[status]}</span>
    </div>
  );
}
