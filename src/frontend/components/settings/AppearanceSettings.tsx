import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  selectDensity,
  selectTheme,
  setDensity,
  setTheme,
  type Density,
} from '../../redux/slices/userSettings';
import { Sun, Moon } from 'lucide-react';
import { LanguageSelect } from '../LanguageSelect';

type ThemeOption = 'light' | 'dark';

const THEME_OPTIONS: { value: ThemeOption; label: string; icon: typeof Sun; description: string }[] = [
  { value: 'light', label: 'Light', icon: Sun, description: 'Clean and bright' },
  { value: 'dark', label: 'Dark', icon: Moon, description: 'Easy on the eyes' },
];

export function AppearanceSettings() {
  const dispatch = useAppDispatch();
  const currentTheme = useAppSelector(selectTheme);
  const density = useAppSelector(selectDensity);

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
        <h3 id="density-group-label" className="text-sm font-medium text-foreground mb-1">
          Interface Density
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          How much space the conversation uses. Compact fits more of a
          long transcript on screen.
        </p>
        <div role="radiogroup" aria-labelledby="density-group-label" className="flex gap-2">
          {(
            [
              { value: 'comfortable', label: 'Comfortable', hint: 'More space between turns' },
              { value: 'compact', label: 'Compact', hint: 'More of the conversation at once' },
            ] as { value: Density; label: string; hint: string }[]
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={density === option.value}
              onClick={() => dispatch(setDensity(option.value))}
              className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                density === option.value
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-secondary/40'
              }`}
            >
              <span className="block text-sm font-medium text-foreground">{option.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <LanguageSelect />
    </div>
  );
}
