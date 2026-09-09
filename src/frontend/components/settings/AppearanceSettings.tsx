import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { selectTheme, setTheme, selectDeveloperMode, setDeveloperMode } from '../../redux/slices/userSettings';
import { Sun, Moon, Monitor } from 'lucide-react';

type ThemeOption = 'light' | 'dark';

const THEME_OPTIONS: { value: ThemeOption; label: string; icon: typeof Sun; description: string }[] = [
  { value: 'light', label: 'Light', icon: Sun, description: 'Clean and bright' },
  { value: 'dark', label: 'Dark', icon: Moon, description: 'Easy on the eyes' },
];

export function AppearanceSettings() {
  const dispatch = useAppDispatch();
  const currentTheme = useAppSelector(selectTheme);
  const developerMode = useAppSelector(selectDeveloperMode);

  return (
    <div className="space-y-6">
      <div>
        <h3 id="theme-group-label" className="text-sm font-medium text-foreground mb-1">Theme</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Choose how {window.APP_DATA?.agentName || 'Agent'} looks for you.
        </p>
        <div
          role="radiogroup"
          aria-labelledby="theme-group-label"
          className="grid grid-cols-2 gap-3"
        >
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = currentTheme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => dispatch(setTheme(opt.value))}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-primary/30 hover:bg-secondary/30'
                }`}
              >
                <Icon className={`w-6 h-6 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                <span className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                  {opt.label}
                </span>
                <span className="text-xs text-muted-foreground">{opt.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground mb-1">Developer Mode</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Show the Developer tab with advanced tools and agent evaluation.
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={developerMode}
          aria-label="Enable Developer Mode"
          onClick={() => dispatch(setDeveloperMode(!developerMode))}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
            developerMode ? 'bg-primary' : 'bg-muted'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              developerMode ? 'translate-x-4' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground mb-1">Interface Density</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Coming soon — adjust spacing and sizing to your preference.
        </p>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
          <Monitor className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Default density</span>
        </div>
      </div>
    </div>
  );
}
