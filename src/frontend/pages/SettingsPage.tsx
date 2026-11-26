import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, CardBody, CardTitle, Nav, NavItem, NavList, Title } from '@patternfly/react-core';
import { ArrowLeftIcon } from '@patternfly/react-icons';
import { ProfileSection } from '../components/settings/ProfileSection';
import { MemoryList } from '../components/settings/MemoryList';
import { RulesEditor } from '../components/settings/RulesEditor';
import { AppearanceSettings } from '../components/settings/AppearanceSettings';
import { AlwaysAllowedTools } from '../components/settings/AlwaysAllowedTools';
import { DeveloperSettings } from '../components/settings/DeveloperSettings';
import { AuthorizationSettings } from '../components/settings/AuthorizationSettings';
import '../components/settings/settings.css';
import { useAppSelector } from '../redux/hooks';
import { selectDeveloperMode } from '../redux/slices/userSettings';
import { OAuthConnections } from '../components/settings/OAuthConnections';
import { isPrivilegedUser } from '../lib/role-utils';
import type { RootState } from '../redux/store';

type TabId = 'profile' | 'memories' | 'rules' | 'appearance' | 'tool-approvals' | 'authorization' | 'oauth' | 'developer';

const TABS: { id: TabId; label: string; panelTitle?: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'memories', label: 'Your Memories' },
  { id: 'rules', label: 'Custom Rules' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'tool-approvals', label: 'Tool Approvals' },
  { id: 'authorization', label: 'Authorization' },
  { id: 'oauth', label: 'MCP OAuth' },
  { id: 'developer', label: 'Developer' },
];

const TAB_CONTENT: Record<TabId, React.FC> = {
  profile: ProfileSection,
  memories: MemoryList,
  rules: RulesEditor,
  appearance: AppearanceSettings,
  'tool-approvals': AlwaysAllowedTools,
  authorization: AuthorizationSettings,
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
  const visibleTabs = useMemo(() => {
    return TABS.filter((tab) => {
      if (tab.id === 'developer') return isPrivilegedUser() && developerMode;
      if (tab.id === 'memories') return features?.memory_enabled !== false;
      return true;
    });
  }, [features, developerMode]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const active = visibleTabs.find((t) => t.id === activeTab) ?? visibleTabs[0];
  const Content = active ? TAB_CONTENT[active.id] : null;

  return (
    <div className="app-settings">
      <div className="app-settings__header">
        <Button variant="plain" onClick={() => navigate('/')} aria-label="Back to home" icon={<ArrowLeftIcon />} />
        <Title headingLevel="h1" size="xl">
          Settings
        </Title>
      </div>

      <div className="app-settings__scroll">
        <div className="app-settings__layout">
          <Nav aria-label="Settings sections" className="app-settings__nav">
            <NavList>
              {visibleTabs.map((tab) => (
                <NavItem
                  key={tab.id}
                  itemId={tab.id}
                  to={`#${tab.id}`}
                  preventDefault
                  isActive={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </NavItem>
              ))}
            </NavList>
          </Nav>

          {active && Content && (
            <Card id="settings-panel" className="app-settings__panel" aria-label={active.label}>
              {active.id !== 'developer' && (
                <CardTitle component="h2" id={`settings-title-${active.id}`}>
                  {active.panelTitle ?? active.label}
                </CardTitle>
              )}
              <CardBody>
                <Content />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
