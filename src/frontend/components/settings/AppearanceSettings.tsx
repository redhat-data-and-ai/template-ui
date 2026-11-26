import { Card, CardBody, CardHeader, CardTitle, Content, Title } from '@patternfly/react-core';
import { DesktopIcon, MoonIcon, SunIcon } from '@patternfly/react-icons';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { selectTheme, setTheme } from '../../redux/slices/userSettings';

type ThemeOption = 'light' | 'dark';

const THEME_OPTIONS: { value: ThemeOption; label: string; icon: typeof SunIcon; description: string }[] = [
  { value: 'light', label: 'Light', icon: SunIcon, description: 'Clean and bright' },
  { value: 'dark', label: 'Dark', icon: MoonIcon, description: 'Easy on the eyes' },
];

export function AppearanceSettings() {
  const dispatch = useAppDispatch();
  const currentTheme = useAppSelector(selectTheme);

  return (
    <div className="app-settings__stack">
      <div>
        <Title headingLevel="h3" size="md" id="theme-group-label">
          Theme
        </Title>
        <p className="app-settings__muted" style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}>
          Choose how {window.APP_DATA?.agentName || 'Agent'} looks for you.
        </p>
        <div role="radiogroup" aria-labelledby="theme-group-label" className="app-settings__theme-grid">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = currentTheme === opt.value;
            return (
              <Card
                key={opt.value}
                id={`theme-card-${opt.value}`}
                isSelectable
                isSelected={isSelected}
                isCompact
              >
                <CardHeader
                  selectableActions={{
                    selectableActionId: `theme-radio-${opt.value}`,
                    selectableActionAriaLabelledby: `theme-card-${opt.value}-title`,
                    name: 'theme',
                    variant: 'single',
                    isChecked: isSelected,
                    onChange: () => dispatch(setTheme(opt.value)),
                  }}
                >
                  <CardTitle id={`theme-card-${opt.value}-title`}>
                    <span className="app-settings__inline">
                      <Icon aria-hidden="true" />
                      {opt.label}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <Content component="small">{opt.description}</Content>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <Title headingLevel="h3" size="md">
          Interface Density
        </Title>
        <p className="app-settings__muted" style={{ marginBlockEnd: 'var(--pf-t--global--spacer--sm)' }}>
          Coming soon: adjust spacing and sizing to your preference.
        </p>
        <p className="app-settings__inline">
          <DesktopIcon aria-hidden="true" />
          Default density
        </p>
      </div>
    </div>
  );
}
