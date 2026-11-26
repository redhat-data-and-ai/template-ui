import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardCopyButton,
  CodeBlock,
  CodeBlockAction,
  CodeBlockCode,
  ExpandableSection,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalHeader,
  ModalVariant,
  Spinner,
  Title,
} from '@patternfly/react-core';
import { FileAltIcon, PlugIcon, WrenchIcon } from '@patternfly/react-icons';
import { EvalDashboard } from './eval';
import { useAppSelector } from '../../redux/hooks';
import type { RootState } from '../../redux/store';
import { fetchAgentStructure, type AgentNode, type AgentStructure } from '../../services/agent-structure';

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <ExpandableSection
      toggleText={title}
      isExpanded={open}
      onToggle={(_event, expanded) => setOpen(expanded)}
    >
      {children}
    </ExpandableSection>
  );
}

function ChipList({ children }: { children: React.ReactNode }) {
  return <LabelGroup numLabels={50}>{children}</LabelGroup>;
}

function AgentTreeNode({ node }: { node: AgentNode }) {
  const hasBadges = Boolean(node.tools?.length || node.skills?.length || node.mcps?.length);
  const [expanded, setExpanded] = useState(true);

  const chips = (
    <ChipList>
      {node.skills?.map((skill) => (
        <Label key={`skill-${skill}`} isCompact icon={<FileAltIcon />}>
          {skill}
        </Label>
      ))}
      {node.tools?.map((tool) => (
        <Label key={`tool-${tool}`} isCompact icon={<WrenchIcon />}>
          {tool}
        </Label>
      ))}
      {node.mcps?.map((mcp) => (
        <Label key={`mcp-${mcp}`} isCompact icon={<PlugIcon />}>
          {mcp}
        </Label>
      ))}
    </ChipList>
  );

  if (!hasBadges) return <strong>{node.name}</strong>;

  return (
    <ExpandableSection
      toggleContent={<strong>{node.name}</strong>}
      isExpanded={expanded}
      onToggle={(_event, next) => setExpanded(next)}
    >
      {chips}
    </ExpandableSection>
  );
}

function AgentStructureTree({ structure }: { structure: AgentStructure }) {
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [skillTrigger, setSkillTrigger] = useState<HTMLElement | null>(null);
  const rootSubagentNames = (structure.orchestrator.subagents ?? [])
    .filter((name) => structure.subagents[name]);
  const displayedSubagentNames = rootSubagentNames.length > 0
    ? rootSubagentNames
    : Object.keys(structure.subagents);
  const mcpServers = Object.entries(structure.mcp_servers);
  const availableSkills = Object.keys(structure.skills ?? {});

  return (
    <div className="app-settings__stack" style={{ marginBlockStart: 'var(--pf-t--global--spacer--lg)' }}>
      <Title headingLevel="h4" size="md">
        Agent structure
      </Title>
      <div className="app-settings__stack" style={{ gap: 'var(--pf-t--global--spacer--md)' }}>
        <AgentTreeNode node={structure.orchestrator} />
        {displayedSubagentNames.length > 0 ? (
          <div className="app-settings__stack" style={{ gap: 'var(--pf-t--global--spacer--md)', marginInlineStart: 'var(--pf-t--global--spacer--xl)' }}>
            {displayedSubagentNames.map((name) => (
              <AgentTreeNode key={name} node={structure.subagents[name]} />
            ))}
          </div>
        ) : null}
      </div>
      {availableSkills.length > 0 ? (
        <div>
          <Title headingLevel="h4" size="md" style={{ marginBlockEnd: 'var(--pf-t--global--spacer--sm)' }}>
            Available skills
          </Title>
          <ChipList>
            {availableSkills.map((skill) => (
              <Label
                key={skill}
                isCompact
                onClick={(event) => {
                  setSkillTrigger(event.currentTarget as HTMLElement);
                  setSelectedSkill(skill);
                }}
                aria-haspopup="dialog"
              >
                {skill}
              </Label>
            ))}
          </ChipList>
        </div>
      ) : null}
      {mcpServers.length > 0 ? (
        <div>
          <Title headingLevel="h4" size="md" style={{ marginBlockEnd: 'var(--pf-t--global--spacer--sm)' }}>
            MCP servers
          </Title>
          <ChipList>
            {mcpServers.map(([name, server]) => (
              <Label key={name} isCompact>
                {server.display_name || name}
              </Label>
            ))}
          </ChipList>
        </div>
      ) : null}
      {selectedSkill ? (
        <SkillContentModal
          name={selectedSkill}
          content={structure.skills?.[selectedSkill] ?? ''}
          triggerElement={skillTrigger}
          onClose={() => {
            setSelectedSkill(null);
            setSkillTrigger(null);
          }}
        />
      ) : null}
    </div>
  );
}

function SkillContentModal({
  name,
  content,
  triggerElement,
  onClose,
}: {
  name: string;
  content: string;
  triggerElement: HTMLElement | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const lineCount = content ? content.split('\n').length : 0;

  useEffect(() => () => triggerElement?.focus(), [triggerElement]);

  const copyContent = async () => {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard access can be unavailable or denied by browser permissions.
    }
  };

  return (
    <Modal variant={ModalVariant.large} isOpen onClose={onClose} aria-labelledby="skill-content-title">
      <ModalHeader
        title={name}
        labelId="skill-content-title"
        description={`Skill instructions · ${lineCount} lines · ${content.length.toLocaleString()} characters`}
      />
      <ModalBody>
        {content ? (
          <CodeBlock
            actions={
              <CodeBlockAction>
                <ClipboardCopyButton
                  id="skill-copy"
                  textId="skill-content"
                  aria-label={copied ? 'Skill instructions copied' : 'Copy skill instructions'}
                  onClick={() => {
                    void copyContent();
                  }}
                  exitDelay={2000}
                  variant="plain"
                >
                  {copied ? 'Copied' : 'Copy'}
                </ClipboardCopyButton>
              </CodeBlockAction>
            }
          >
            <CodeBlockCode>{content}</CodeBlockCode>
          </CodeBlock>
        ) : (
          <p>This skill does not include a SKILL.md instruction file.</p>
        )}
      </ModalBody>
    </Modal>
  );
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="app-settings__muted">{label}</p>
      {children}
    </div>
  );
}

function AgentDetails({ agent, isMainAgent = false }: { agent: AgentNode; isMainAgent?: boolean }) {
  const [open, setOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const hasDetails = Boolean(
    agent.description || agent.model || agent.tools?.length || agent.skills?.length || agent.mcps?.length || agent.body,
  );

  const copyPrompt = async () => {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(agent.body ?? '');
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2_000);
    } catch {
      // Clipboard access can be unavailable or denied by browser permissions.
    }
  };

  const codeChips = (items: string[]) => (
    <ChipList>
      {items.map((item) => (
        <Label key={item} isCompact variant="outline">
          <code>{item}</code>
        </Label>
      ))}
    </ChipList>
  );

  return (
    <ExpandableSection
      toggleContent={
        <span>
          <strong>{agent.name}</strong>
          {isMainAgent ? (
            <>
              {' '}
              <Label isCompact>Main agent</Label>
            </>
          ) : null}
        </span>
      }
      isExpanded={open}
      onToggle={(_event, next) => setOpen(next)}
    >
      <div className="app-settings__stack" style={{ gap: 'var(--pf-t--global--spacer--md)' }}>
        {!hasDetails ? <p className="app-settings__muted">No additional configuration.</p> : null}
        {agent.description ? (
          <DetailBlock label="Description">
            <p>{agent.description}</p>
          </DetailBlock>
        ) : null}
        {agent.model ? (
          <DetailBlock label="Model">
            <Label isCompact variant="outline">
              <code>{agent.model}</code>
            </Label>
          </DetailBlock>
        ) : null}
        {agent.tools?.length ? <DetailBlock label="Tools">{codeChips(agent.tools)}</DetailBlock> : null}
        {agent.skills?.length ? <DetailBlock label="Skills">{codeChips(agent.skills)}</DetailBlock> : null}
        {agent.mcps?.length ? <DetailBlock label="MCP servers">{codeChips(agent.mcps)}</DetailBlock> : null}
        {agent.body ? (
          <DetailBlock label="System prompt">
            <CodeBlock
              actions={
                <CodeBlockAction>
                  <ClipboardCopyButton
                    id={`prompt-copy-${agent.name}`}
                    textId={`prompt-${agent.name}`}
                    aria-label={promptCopied ? 'System prompt copied' : 'Copy system prompt'}
                    onClick={() => {
                      void copyPrompt();
                    }}
                    exitDelay={2000}
                    variant="plain"
                  >
                    {promptCopied ? 'Copied' : 'Copy'}
                  </ClipboardCopyButton>
                </CodeBlockAction>
              }
            >
              <CodeBlockCode>{agent.body}</CodeBlockCode>
            </CodeBlock>
          </DetailBlock>
        ) : null}
      </div>
    </ExpandableSection>
  );
}

function AgentDetailsList({ structure }: { structure: AgentStructure }) {
  return (
    <div className="app-settings__stack" style={{ gap: 'var(--pf-t--global--spacer--md)', marginBlockStart: 'var(--pf-t--global--spacer--lg)' }}>
      <Title headingLevel="h4" size="md">
        Agents
      </Title>
      <AgentDetails agent={structure.orchestrator} isMainAgent />
      {Object.values(structure.subagents).map((agent) => (
        <AgentDetails key={agent.name} agent={agent} />
      ))}
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
    <div className="app-settings__stack">
      <CollapsibleSection title="Agent Information" defaultOpen={true}>
        <p>
          <span className="app-settings__muted">Agent Version: </span>
          <Label isCompact variant="outline">
            <code>{branding?.version ?? '—'}</code>
          </Label>
        </p>
        {loadingStructure ? (
          <div className="app-settings__row" style={{ justifyContent: 'flex-start', marginBlockStart: 'var(--pf-t--global--spacer--md)' }} role="status">
            <Spinner size="md" aria-hidden="true" />
            Loading agent structure...
          </div>
        ) : null}
        {structureError ? <p className="app-settings__muted">{structureError}</p> : null}
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
