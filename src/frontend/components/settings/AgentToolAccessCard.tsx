import { useEffect, useState } from 'react';
import { Spinner } from '@patternfly/react-core';
import { Shield, ShieldCheck, ShieldX, ShieldAlert } from 'lucide-react';
import { getAgentToolAccess, type ToolAccessInfo, type ToolAccessEntity } from '@/services/agent-rest';

type CellStatus = 'allowed' | 'denied' | 'approval' | 'na';

function getCellStatus(entity: ToolAccessEntity, tool: string): CellStatus {
  if (entity.denied_tools.includes(tool)) return 'denied';
  const hasAllowList = entity.allowed_tools.length > 0;
  const isAllowed = !hasAllowList || entity.allowed_tools.includes(tool);
  if (!isAllowed) return 'na';
  if (entity.tool_approval.includes(tool)) return 'approval';
  return 'allowed';
}

const STATUS_CONFIG: Record<CellStatus, { label: string; className: string; icon: typeof Shield }> = {
  allowed:  { label: 'Allowed',  className: 'bg-green-500/10 text-green-400 border-green-500/30',   icon: ShieldCheck },
  denied:   { label: 'Denied',   className: 'bg-red-500/10 text-red-400 border-red-500/30',         icon: ShieldX },
  approval: { label: 'Approval', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',   icon: ShieldAlert },
  na:       { label: '--',        className: 'bg-muted/30 text-muted-foreground/50 border-border/30', icon: Shield },
};

function StatusBadge({ status }: { status: CellStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

export function AgentToolAccessCard() {
  const [data, setData] = useState<ToolAccessInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAgentToolAccess().then((result) => {
      setData(result);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
        <Shield className="w-6 h-6 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Tool access configuration not available.</p>
      </div>
    );
  }

  const entities: ToolAccessEntity[] = [data.orchestrator, ...data.subagents];

  const allTools = new Set<string>();
  for (const entity of entities) {
    entity.allowed_tools.forEach((t) => allTools.add(t));
    entity.denied_tools.forEach((t) => allTools.add(t));
    entity.tool_approval.forEach((t) => allTools.add(t));
  }
  const sortedTools = Array.from(allTools).sort();

  if (sortedTools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
        <Shield className="w-6 h-6 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No tools configured for this agent.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
              Tool
            </th>
            {entities.map((entity) => (
              <th
                key={entity.name}
                className="text-center py-2 px-2 font-semibold text-[10px] uppercase tracking-wider"
              >
                <div className="text-foreground">{entity.name}</div>
                {entity.type && (
                  <div className="text-muted-foreground/60 font-normal normal-case">{entity.type}</div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedTools.map((tool) => (
            <tr key={tool} className="border-b border-border/50 hover:bg-muted/20">
              <td className="py-2 px-2">
                <code className="text-xs font-mono text-foreground">{tool}</code>
              </td>
              {entities.map((entity) => (
                <td key={`${entity.name}-${tool}`} className="py-2 px-2 text-center">
                  <StatusBadge status={getCellStatus(entity, tool)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
