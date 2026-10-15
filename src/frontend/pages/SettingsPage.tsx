import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@patternfly/react-core';
import { ArrowLeft, User, Brain, Palette, Code2, Boxes } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfileSection } from '../components/settings/ProfileSection';
import { MemoryList } from '../components/settings/MemoryList';
import { RulesEditor } from '../components/settings/RulesEditor';
import { AppearanceSettings } from '../components/settings/AppearanceSettings';
import { AuthorizationSettings } from '../components/settings/AuthorizationSettings';
import { useAppSelector } from '../redux/hooks';
import { selectDeveloperMode } from '../redux/slices/userSettings';
import {
  ComponentsPanel,
  useVisibleComponentSections,
} from '../components/settings/ComponentsPanel';
import { DeveloperPanel } from '../components/settings/DeveloperPanel';
import { isPrivilegedUser } from '../lib/role-utils';

type TabId =
  | 'account'
  | 'appearance'
  | 'personalisation'
  | 'components'
  | 'developers';

/**
 * Eight tabs became six.
 *
 * The old split was by *component* — one panel per thing somebody had
 * built — rather than by the question a reader arrives with. Profile
 * and Appearance are both "me"; Memories and Custom Rules are both
 * "what it knows about me"; Tool Approvals, Authorization and MCP
 * OAuth are all "what it is allowed to do". Three questions, three
 * tabs, with sub-headings inside so the merged panels do not read as
 * one undifferentiated form.
 *
 * Usage moved in from its own route; the old /analytics URL
 * redirects.
 *
 * There is no Documents tab. Documents are attached to the
 * conversation that needs them, which is where people already expect
 * to hand a file over — a separate library meant uploading in one
 * place and asking in another, and keeping the two in your head.
 */
const LEGACY_TAB_IDS: Record<string, TabId> = {
  profile: 'account',
  authorization: 'account',
  memories: 'personalisation',
  rules: 'personalisation',
  'tool-approvals': 'components',
  oauth: 'components',
  permissions: 'components',
  mcp: 'components',
  skills: 'components',
  subagents: 'components',
  prompt: 'components',
  datasets: 'components',
  documents: 'components',
  analytics: 'developers',
  evaluations: 'developers',
  usage: 'developers',
  flags: 'developers',
  developer: 'developers',
};

const TABS: {
  id: TabId;
  /** Copy comes from `settings.tabs.<id>`; the id is the key. */
  panelTitle?: string;
  icon: typeof User;
  /** Panels that bring their own headings and container. */
  bare?: boolean;
}[] = [
  { id: 'account', icon: User },
  { id: 'appearance', icon: Palette },
  { id: 'personalisation', icon: Brain },
  // MCP, Skills, Subagents and Prompt were four entries in a bar
  // that had reached eleven. They answer one question at four
  // levels — what the agent is connected to, what it knows how to
  // do, who it delegates to, and the rules it follows — so they are
  // one tab with sections inside.
  { id: 'components', icon: Boxes, bare: true },
  // Usage, Feature flags and Evaluations share one audience and
  // one gate, so three tabs that appeared and disappeared together
  // are one tab with sections inside.
  { id: 'developers', icon: Code2, bare: true },
];

/** A labelled group inside a merged panel. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-6 first:border-0 first:pt-0">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

const AccountPanel = () => (
  <div className="space-y-6">
    <Group title="Profile">
      <ProfileSection />
    </Group>
    {/* Authorization is about this account: what it has let the
        agent do on its behalf. It read as a separate concern on its
        own tab when it is really the second half of "who am I
        here". */}
    <Group title="Authorization">
      <AuthorizationSettings />
    </Group>
  </div>
);

const PersonalisationPanel = () => (
  <div className="space-y-6">
    <Group title="Your memories">
      <MemoryList />
    </Group>
    <Group title="Custom rules">
      <RulesEditor />
    </Group>
  </div>
);

const TAB_CONTENT: Record<TabId, React.FC> = {
  account: AccountPanel,
  appearance: AppearanceSettings,
  personalisation: PersonalisationPanel,
  components: ComponentsPanel,
  developers: DeveloperPanel,
};

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const developerMode = useAppSelector(selectDeveloperMode);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const param = searchParams.get('tab');
    // Old links keep working: `?tab=profile` lands on Account,
    // `?tab=tool-approvals` on MCP, and so on.
    const resolved = param && (LEGACY_TAB_IDS[param] ?? param);
    if (resolved && VALID_TABS.has(resolved)) {
      if (resolved === 'developer' && !developerMode) return 'account';
      return resolved as TabId;
    }
    return 'account';
  });
  const tabRefs = useRef<Map<TabId, HTMLButtonElement>>(new Map());

  const componentSections = useVisibleComponentSections();

  const visibleTabs = useMemo(() => {
    return TABS.filter((tab) => {
      // Operator surfaces: a privileged LDAP role *and* developer
      // mode. The agent already refuses `/analytics/*` and
      // `/documents/*` without the role — this is the UI agreeing
      // with it, plus the toggle, so they stay off the everyday bar.
      if (tab.id === 'developers') return isPrivilegedUser() && developerMode;
      // Each Components section carries its own gate, checked inside
      // the panel. The group disappears only when every member is
      // hidden, so turning them all off does not leave an empty tab.
      if (tab.id === 'components') return componentSections.length > 0;
      return true;
    });
  }, [developerMode, componentSections]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const handleTabKeyDown = (e: React.KeyboardEvent, tabId: TabId) => {
    const tabIds = visibleTabs.map((t) => t.id);
    const currentIndex = tabIds.indexOf(tabId);

    let nextIndex: number | null = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabIds.length;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabIds.length - 1;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      const nextId = tabIds[nextIndex];
      setActiveTab(nextId);
      tabRefs.current.get(nextId)?.focus();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 border-b border-border bg-card/60 backdrop-blur-sm px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Button
            variant="plain"
            size="sm"
            onClick={() => navigate('/')}
            aria-label="Back to home"
            className="!p-1.5"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Tab navigation */}
            <nav className="sm:w-52 shrink-0" aria-label="Settings sections">
              <div
                role="tablist"
                aria-orientation="vertical"
                aria-label="Settings"
                className="flex sm:flex-col gap-1"
              >
                {visibleTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      id={`settings-tab-${tab.id}`}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`settings-panel-${tab.id}`}
                      tabIndex={isActive ? 0 : -1}
                      ref={(el) => {
                        if (el) tabRefs.current.set(tab.id, el);
                      }}
                      onClick={() => setActiveTab(tab.id)}
                      onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                      )}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                      {t(`settings.tabs.${tab.id}`)}
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {visibleTabs.map((tab) => {
                const Content = TAB_CONTENT[tab.id];
                return (
                  <div
                    key={tab.id}
                    id={`settings-panel-${tab.id}`}
                    role="tabpanel"
                    aria-labelledby={`settings-tab-${tab.id}`}
                    hidden={activeTab !== tab.id}
                    tabIndex={0}
                    className="bg-card border border-border rounded-xl p-6 focus:outline-none"
                  >
                    {!tab.bare && (
                      <h2 className="text-base font-semibold text-foreground mb-6">{tab.panelTitle ?? t(`settings.tabs.${tab.id}`)}</h2>
                    )}
                    {activeTab === tab.id && <Content />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
