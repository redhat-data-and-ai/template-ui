import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardBody,
  CardExpandableContent,
  CardHeader,
  CardTitle,
  ClipboardCopyButton,
  CodeBlock,
  CodeBlockAction,
  CodeBlockCode,
  ExpandableSection,
  Divider,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalHeader,
  ModalVariant,
  Spinner,
  Title,
} from '@patternfly/react-core';
import {
  CubesIcon,
  FileAltIcon,
  RobotIcon,
  ServerIcon,
  SitemapIcon,
  WrenchIcon,
} from '@patternfly/react-icons';
import { EvalDashboard } from './eval';
import { useAppSelector } from '../../redux/hooks';
import type { RootState } from '../../redux/store';
import { fetchAgentStructure, type AgentNode, type AgentStructure } from '../../services/agent-structure';

function CollapsibleSection({
  id,
  title,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card isCompact isExpanded={open} className="app-dev__card" id={id}>
      <CardHeader
        className="app-dev__card-header"
        onExpand={() => setOpen((prev) => !prev)}
        isToggleRightAligned
        toggleButtonProps={{
          id: `${id}-toggle`,
          'aria-label': title,
          'aria-expanded': open,
        }}
      >
        <CardTitle component="h3" id={`${id}-title`} className="app-dev__card-title">{title}</CardTitle>
      </CardHeader>
      <CardExpandableContent>
        <CardBody className="app-dev__card-body">{children}</CardBody>
      </CardExpandableContent>
    </Card>
  );
}

function ChipList({ children }: { children: React.ReactNode }) {
  return <LabelGroup numLabels={50}>{children}</LabelGroup>;
}

function SectionHeader({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <Divider className="app-dev__divider" />
      <Title headingLevel="h3" size="md" className="app-dev__title">
        <span className="app-dev__title-icon" aria-hidden="true">{icon}</span>
        {children}
      </Title>
    </>
  );
}

function AgentName({ name }: { name: string }) {
  return (
    <span className="app-dev__agent-name">
      <RobotIcon className="app-dev__agent-icon" aria-hidden="true" />
      <strong>{name}</strong>
    </span>
  );
}

function AgentTreeNode({ node }: { node: AgentNode }) {
  const hasBadges = Boolean(node.tools?.length || node.skills?.length || node.mcps?.length);
  const [expanded, setExpanded] = useState(true);

  const chips = (
    <ChipList>
      {node.skills?.map((skill) => (
        <Label key={`skill-${skill}`} isCompact color="teal" icon={<FileAltIcon />}>
          {skill}
        </Label>
      ))}
      {node.tools?.map((tool) => (
        <Label key={`tool-${tool}`} isCompact variant="outline" icon={<WrenchIcon />}>
          {tool}
        </Label>
      ))}
      {node.mcps?.map((mcp) => (
        <Label key={`mcp-${mcp}`} isCompact color="purple" icon={<ServerIcon />}>
          {mcp}
        </Label>
      ))}
    </ChipList>
  );

  if (!hasBadges) return <AgentName name={node.name} />;

  return (
    <ExpandableSection
      toggleContent={<AgentName name={node.name} />}
      className="app-dev__node"
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
    <div className="app-dev__section">
      <SectionHeader icon={<SitemapIcon />}>Agent structure</SectionHeader>
      <div className="app-dev__tree">
        <AgentTreeNode node={structure.orchestrator} />
        {displayedSubagentNames.length > 0 ? (
          <div className="app-dev__children">
            {displayedSubagentNames.map((name) => (
              <AgentTreeNode key={name} node={structure.subagents[name]} />
            ))}
          </div>
        ) : null}
      </div>
      {availableSkills.length > 0 ? (
        <>
          <SectionHeader icon={<FileAltIcon />}>Available skills</SectionHeader>
          <ChipList>
            {availableSkills.map((skill) => (
              <Label
                key={skill}
                isCompact
                color="teal"
                icon={<FileAltIcon />}
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
        </>
      ) : null}
      {mcpServers.length > 0 ? (
        <>
          <SectionHeader icon={<ServerIcon />}>MCP servers</SectionHeader>
          <ChipList>
            {mcpServers.map(([name, server]) => (
              <Label key={name} isCompact color="purple" icon={<ServerIcon />}>
                {server.display_name || name}
              </Label>
            ))}
          </ChipList>
        </>
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
    <div className="app-dev__field">
      <p className="app-dev__caption">{label}</p>
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

  const codeChips = (items: string[], icon: React.ReactNode) => (
    <ChipList>
      {items.map((item) => (
        <Label key={item} isCompact variant="outline" icon={icon}>
          <code>{item}</code>
        </Label>
      ))}
    </ChipList>
  );

  return (
    <ExpandableSection
      toggleContent={
        <span className="app-dev__agent-head">
          <strong>{agent.name}</strong>
          {isMainAgent ? <Label isCompact color="blue" variant="filled">Main agent</Label> : null}
        </span>
      }
      className="app-dev__agent"
      isExpanded={open}
      onToggle={(_event, next) => setOpen(next)}
    >
      <div className="app-dev__details">
        {!hasDetails ? <p className="app-settings__muted">No additional configuration.</p> : null}
        {agent.description ? (
          <DetailBlock label="Description">
            <p>{agent.description}</p>
          </DetailBlock>
        ) : null}
        {agent.model ? (
          <DetailBlock label="Model">
            <code className="app-dev__code">{agent.model}</code>
          </DetailBlock>
        ) : null}
        {agent.tools?.length ? <DetailBlock label="Tools">{codeChips(agent.tools, <WrenchIcon />)}</DetailBlock> : null}
        {agent.skills?.length ? <DetailBlock label="Skills">{codeChips(agent.skills, <FileAltIcon />)}</DetailBlock> : null}
        {agent.mcps?.length ? <DetailBlock label="MCP servers">{codeChips(agent.mcps, <ServerIcon />)}</DetailBlock> : null}
        {agent.body ? (
          <DetailBlock label="System prompt">
            <CodeBlock
              className="app-dev__prompt"
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
    <div className="app-dev__section">
      <SectionHeader icon={<CubesIcon />}>Agents</SectionHeader>
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
      <CollapsibleSection id="dev-agent-information" title="Agent Information" defaultOpen={true}>
        <p>
          <span className="app-settings__muted">Agent Version: </span>
          <code className="app-dev__code">{branding?.version ?? '—'}</code>
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
      <CollapsibleSection id="dev-agent-evaluation" title="Agent Evaluation">
        <EvalDashboard />
      </CollapsibleSection>
    </div>
  );
}
