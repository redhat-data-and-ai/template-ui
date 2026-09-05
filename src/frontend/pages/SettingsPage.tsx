import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@patternfly/react-core';
import { ArrowLeft, User, Brain, ScrollText, Palette, ShieldCheck, Code2, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfileSection } from '../components/settings/ProfileSection';
import { MemoryList } from '../components/settings/MemoryList';
import { RulesEditor } from '../components/settings/RulesEditor';
import { AppearanceSettings } from '../components/settings/AppearanceSettings';
import { AlwaysAllowedTools } from '../components/settings/AlwaysAllowedTools';
import { DeveloperSettings } from '../components/settings/DeveloperSettings';
import { useAppSelector } from '../redux/hooks';
import { selectDeveloperMode } from '../redux/slices/userSettings';
import { OAuthConnections } from '../components/settings/OAuthConnections';
import type { RootState } from '../redux/store';

type TabId = 'profile' | 'memories' | 'rules' | 'appearance' | 'tool-approvals' | 'oauth' | 'developer';

const TABS: { id: TabId; label: string; panelTitle?: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'rules', label: 'User Rules', icon: ScrollText },
  { id: 'memories', label: 'Your Memories', icon: Brain },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'tool-approvals', label: 'Tool Approvals', icon: ShieldCheck },
  { id: 'oauth', label: 'MCP OAuth', icon: KeyRound },
  { id: 'developer', label: 'Developer', icon: Code2 },
];

const TAB_CONTENT: Record<TabId, React.FC> = {
  profile: ProfileSection,
  memories: MemoryList,
  rules: RulesEditor,
  appearance: AppearanceSettings,
  'tool-approvals': AlwaysAllowedTools,
  oauth: OAuthConnections,
  developer: DeveloperSettings,
};

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

export function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const developerMode = useAppSelector(selectDeveloperMode);
  const features = useAppSelector((state: RootState) => state.config.features);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const param = searchParams.get('tab');
    if (param && VALID_TABS.has(param)) {
      if (param === 'developer' && !developerMode) return 'profile';
      return param as TabId;
    }
    return 'profile';
  });
  const tabRefs = useRef<Map<TabId, HTMLButtonElement>>(new Map());

  const visibleTabs = useMemo(() => {
    return TABS.filter((tab) => {
      if (tab.id === 'developer') return developerMode;
      if (tab.id === 'memories') return features?.memory_enabled !== false;
      if (tab.id === 'rules') return features?.user_rules_enabled !== false;
      return true;
    });
  }, [features, developerMode]);

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
            <nav className="sm:w-48 shrink-0" aria-label="Settings sections">
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
                      {tab.label}
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
                    {tab.id !== 'developer' && (
                      <h2 className="text-base font-semibold text-foreground mb-4">{tab.panelTitle ?? tab.label}</h2>
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
