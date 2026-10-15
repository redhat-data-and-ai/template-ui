import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import { useAppSelector } from '../../redux/hooks';
import type { RootState } from '../../redux/store';
import { McpServerList } from './McpServerList';
import { AlwaysAllowedTools } from './AlwaysAllowedTools';
import { SkillList } from './SkillList';
import { SubagentList } from './SubagentList';
import { PromptView } from './PromptView';
import { ModelList } from './ModelList';
import { DocumentList } from './DocumentList';
import { isPrivilegedUser } from '../../lib/role-utils';
import { selectDeveloperMode } from '../../redux/slices/userSettings';

/**
 * What the agent is made of.
 *
 * MCP, Skills, Subagents and Prompt were four entries in a Settings
 * bar that had reached eleven. They are one question — *how does
 * this thing work* — answered at four levels: what it is connected
 * to, what it knows how to do, who it delegates to, and the rules it
 * follows. Nesting them turns four guesses into one.
 *
 * Each keeps its own visibility flag. The group itself disappears
 * when every member is hidden, so a deployment that turns all four
 * off does not leave an empty tab behind.
 */
interface Section {
  key: string;
  label: string;
  /** Hidden by a deployment-wide flag. */
  flag?: 'skills' | 'subagents' | 'prompt' | 'models';
  /** Never hidden. */
  alwaysVisible?: boolean;
  /** Hidden unless the reader is an operator. Not a flag: Documents
      is a shared volume with no per-user partitioning, and what is
      on it is what the model reads — so changing it is an operator
      capability rather than a deployment preference. The agent
      enforces the same rule with a 403. */
  developerOnly?: boolean;
  render: () => React.ReactNode;
}

export function useVisibleComponentSections(): Section[] {
  const { t } = useTranslation();
  const features = useAppSelector((state: RootState) => state.config.features);
  const developerMode = useAppSelector(selectDeveloperMode);

  return useMemo(() => {
    const all: Section[] = [
      {
        key: 'mcp',
        label: 'MCP',  // a protocol name, the same in every language
        // No flag, deliberately. The others are read-only
        // explanations of how the agent works — fine to hide. MCP is
        // where a person connects their own integrations, so hiding
        // it does not simplify the page, it removes the ability to
        // use the product.
        alwaysVisible: true,
        render: () => (
          <div className="space-y-6">
            {/* Servers first, approvals second: you connect a
                server, then decide which of the tools it brought may
                run unattended. */}
            <section>
              <h3 className="mb-4 text-sm font-semibold text-foreground">
                {t('components.mcpServers')}
              </h3>
              <McpServerList />
            </section>
            <section className="border-t border-border pt-6">
              <h3 className="mb-4 text-sm font-semibold text-foreground">
                {t('components.toolApprovals')}
              </h3>
              <AlwaysAllowedTools />
            </section>
          </div>
        ),
      },
      {
        key: 'models',
        label: t('models.title'),
        flag: 'models',
        render: () => (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              {t('models.description')}
            </p>
            <ModelList />
          </div>
        ),
      },
      {
        key: 'skills',
        label: t('skills.title'),
        flag: 'skills',
        render: () => (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              {t('components.skillsDescription')}
            </p>
            <SkillList />
          </div>
        ),
      },
      {
        key: 'subagents',
        label: t('subagents.title'),
        flag: 'subagents',
        render: () => (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              {t('components.subagentsDescription')}
            </p>
            <SubagentList />
          </div>
        ),
      },
      {
        key: 'documents',
        label: t('documents.title'),
        developerOnly: true,
        render: () => (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              {/* The mount path is interpolated rather than written
                  into the sentence: it is the one part a fork changes,
                  and a translator should never have to keep five
                  copies of it in step. */}
              {t('components.documentsDescription', { path: '/documents/' })}
            </p>
            <DocumentList />
          </div>
        ),
      },
      {
        key: 'prompt',
        label: t('prompt.title'),
        flag: 'prompt',
        render: () => (
          <div>
            <PromptView />
          </div>
        ),
      },
    ];

    return all.filter((section) => {
      if (section.alwaysVisible) return true;
      if (section.developerOnly) return isPrivilegedUser() && developerMode;

      // Absent means visible, so an older config does not silently
      // lose a section.
      const key = `${section.flag}_visible_to_all` as const;
      if ((features as Record<string, unknown> | null)?.[key] !== false) {
        return true;
      }

      // Off hides it from *users*, not from operators. The flag
      // answers "should everyone see this", and a developer turning
      // it off is deciding what the product shows — not giving up
      // their own view of how the agent is configured.
      //
      // This fallback was removed once, on the reading that a switch
      // with no visible effect for the person flipping it must be
      // broken. The switch was fine; what was broken was that the
      // page did not reload the config after a write, so nothing
      // changed for anyone until a refresh.
      return isPrivilegedUser() && developerMode;
    });
  }, [features, developerMode, t]);
}

export function ComponentsPanel() {
  const { t } = useTranslation();
  const sections = useVisibleComponentSections();
  const [active, setActive] = useState(0);

  if (sections.length === 0) return null;

  // Clamped rather than stored by key: hiding a section while it is
  // selected would otherwise leave the panel pointing past the end
  // of the list and render nothing.
  const index = Math.min(active, sections.length - 1);

  return (
    <Tabs
      activeKey={index}
      onSelect={(_e, key) => setActive(Number(key))}
      aria-label={t('components.title')}
    >
      {sections.map((section, i) => (
        <Tab
          key={section.key}
          eventKey={i}
          title={<TabTitleText>{section.label}</TabTitleText>}
        >
          {/* One padding rule for every section. */}
          {index === i && <div className="pt-5">{section.render()}</div>}
        </Tab>
      ))}
    </Tabs>
  );
}
