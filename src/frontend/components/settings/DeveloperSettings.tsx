import { useCallback, useEffect, useState } from 'react';
import { Bot, ChevronDown, FileText, FolderTree, LoaderCircle, Plug, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EvalDashboard } from './eval';
import { useAppSelector } from '../../redux/hooks';
import type { RootState } from '../../redux/store';
import { fetchAgentStructure, type AgentNode, type AgentStructure } from '../../services/agent-structure';

function CollapsibleSection({
  title,
  defaultOpen = true,
  onOpenChange,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/30 hover:bg-secondary/50 transition-colors text-left cursor-pointer"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function AgentTreeNode({ node }: { node: AgentNode }) {
  const hasBadges = Boolean(node.tools?.length || node.skills?.length || node.mcps?.length);

  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        type="button"
        onClick={() => hasBadges && setExpanded((v) => !v)}
        className={cn(
          'flex items-center gap-2 text-sm rounded px-1 py-0.5',
          hasBadges && 'hover:bg-secondary/50 cursor-pointer',
        )}
        aria-expanded={hasBadges ? expanded : undefined}
      >
        <Bot className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="font-medium text-foreground">{node.name}</span>
        {hasBadges ? (
          <ChevronDown
            className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        ) : null}
      </button>
      {expanded ? (
        <div className="mt-1.5 ml-7 flex flex-wrap gap-1.5">
          {node.skills?.map((skill) => (
            <span key={`skill-${skill}`} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <FileText className="h-3 w-3" aria-hidden="true" />
              {skill}
            </span>
          ))}
          {node.tools?.map((tool) => (
            <span key={`tool-${tool}`} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <Wrench className="h-3 w-3" aria-hidden="true" />
              {tool}
            </span>
          ))}
          {node.mcps?.map((mcp) => (
            <span key={`mcp-${mcp}`} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <Plug className="h-3 w-3" aria-hidden="true" />
              {mcp}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AgentStructureTree({ structure }: { structure: AgentStructure }) {
  const rootSubagentNames = (structure.orchestrator.subagents ?? [])
    .filter((name) => structure.subagents[name]);
  const displayedSubagentNames = rootSubagentNames.length > 0
    ? rootSubagentNames
    : Object.keys(structure.subagents);
  const mcpServers = Object.entries(structure.mcp_servers);

  return (
    <div className="mt-6 space-y-6 border-t border-border pt-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <FolderTree className="h-4 w-4 text-primary" aria-hidden="true" />
        Agent structure
      </div>
      <div className="space-y-3">
        <AgentTreeNode node={structure.orchestrator} />
        {displayedSubagentNames.length > 0 ? (
          <div className="ml-10 space-y-3">
            {displayedSubagentNames.map((name) => (
              <AgentTreeNode key={name} node={structure.subagents[name]} />
            ))}
          </div>
        ) : null}
      </div>
      {structure.available_skills.length > 0 ? (
        <div className="space-y-2 border-t border-border mt-2 pt-5">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            Available skills
          </div>
          <div className="flex flex-wrap gap-1.5 pl-6">
            {structure.available_skills.map((skill) => (
              <span key={skill} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {skill}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {mcpServers.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Plug className="h-4 w-4 text-primary" aria-hidden="true" />
            MCP servers
          </div>
          <div className="flex flex-wrap gap-1.5 pl-6">
            {mcpServers.map(([name, server]) => (
              <span key={name} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {server.display_name || name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AgentDetails({ agent, isMainAgent = false }: { agent: AgentNode; isMainAgent?: boolean }) {
  const [open, setOpen] = useState(false);
  const hasDetails = Boolean(
    agent.description || agent.model || agent.tools?.length || agent.skills?.length || agent.mcps?.length,
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded py-1.5 text-left text-sm hover:bg-secondary/50"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="font-medium text-foreground">{agent.name}</span>
          {isMainAgent ? (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              Main agent
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="ml-2 mt-1 space-y-3 border-l border-border py-1 pl-4 text-sm">
          {!hasDetails ? <p className="text-muted-foreground">No additional configuration.</p> : null}
          {agent.description ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</p>
              <p className="mt-1 text-foreground">{agent.description}</p>
            </div>
          ) : null}
          {agent.model ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Model</p>
              <code className="mt-1 inline-block rounded bg-muted px-2 py-1 text-xs">{agent.model}</code>
            </div>
          ) : null}
          {agent.tools?.length ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tools</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {agent.tools.map((tool) => <code key={tool} className="rounded bg-muted px-2 py-1 text-xs">{tool}</code>)}
              </div>
            </div>
          ) : null}
          {agent.skills?.length ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Skills</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {agent.skills.map((skill) => <code key={skill} className="rounded bg-muted px-2 py-1 text-xs">{skill}</code>)}
              </div>
            </div>
          ) : null}
          {agent.mcps?.length ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">MCP servers</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {agent.mcps.map((mcp) => <code key={mcp} className="rounded bg-muted px-2 py-1 text-xs">{mcp}</code>)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AgentDetailsList({ structure }: { structure: AgentStructure }) {
  return (
    <div className="space-y-3 border-t border-border mt-2 pt-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
        Agents
      </div>
      <div className="space-y-2 pl-6">
        <AgentDetails agent={structure.orchestrator} isMainAgent />
        {Object.values(structure.subagents).map((agent) => (
          <AgentDetails key={agent.name} agent={agent} />
        ))}
      </div>
    </div>
  );
}

export function DeveloperSettings() {
  const branding = useAppSelector((state: RootState) => state.config.branding);
  const [structure, setStructure] = useState<AgentStructure | null>(null);
  const [loadingStructure, setLoadingStructure] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);

  const loadAgentStructure = useCallback(async () => {
    if (structure || loadingStructure) return;

    setLoadingStructure(true);
    setStructureError(null);
    try {
      setStructure(await fetchAgentStructure());
    } catch {
      setStructureError('Agent structure is unavailable.');
    } finally {
      setLoadingStructure(false);
    }
  }, [structure, loadingStructure]);

  useEffect(() => { loadAgentStructure(); }, [loadAgentStructure]);

  return (
    <div className="space-y-4">
      <CollapsibleSection title="Agent Information" defaultOpen={true}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Agent Version:</span>
          <code className="rounded bg-muted px-2 py-1 text-sm font-medium">
            {branding?.version ?? '—'}
          </code>
        </div>
        {loadingStructure ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading agent structure...
          </div>
        ) : null}
        {structureError ? (
          <p className="mt-4 text-sm text-muted-foreground">{structureError}</p>
        ) : null}
        {structure ? <>
          <AgentStructureTree structure={structure} />
          <AgentDetailsList structure={structure} />
        </> : null}
      </CollapsibleSection>
      <CollapsibleSection title="Agent Evaluation">
        <EvalDashboard />
      </CollapsibleSection>
    </div>
  );
}
