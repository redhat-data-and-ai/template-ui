import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import { AnalyticsPage } from '../../pages/AnalyticsPage';
import { AdminPage } from '../../pages/AdminPage';
import { DeveloperSettings } from './DeveloperSettings';

/**
 * Operator surfaces, grouped.
 *
 * Usage, Evaluations and Feature flags were three entries in the
 * outer bar that share one audience and one gate: a privileged role
 * plus developer mode. Three tabs that appear and disappear together
 * are one tab.
 *
 * Unlike Components, there is no per-section flag. These are not
 * things a deployment chooses to show or hide — they are things only
 * operators may see at all, and the agent enforces that
 * independently (`/analytics/*` and `/documents/*` return 403 without
 * the role). A switch here would imply a choice that does not exist.
 */
const SECTIONS = [
  { key: 'usage', render: () => <AnalyticsPage embedded /> },
  { key: 'flags', render: () => <AdminPage embedded /> },
  { key: 'evaluations', render: () => <DeveloperSettings /> },
] as const;

export function DeveloperPanel() {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);

  return (
    <Tabs
      activeKey={active}
      onSelect={(_e, key) => setActive(Number(key))}
      aria-label={t('developers.title')}
    >
      {SECTIONS.map((section, i) => (
        <Tab
          key={section.key}
          eventKey={i}
          title={<TabTitleText>{t(`developers.tabs.${section.key}`)}</TabTitleText>}
        >
          {/* Mounted only while selected. Usage fires four requests
              on mount; rendering all three up front would run them
              for someone who came to flip a flag.
              Padding lives here, once, rather than in each section —
              repeating it is how one of them ended up without any. */}
          {active === i && <div className="pt-5">{section.render()}</div>}
        </Tab>
      ))}
    </Tabs>
  );
}
