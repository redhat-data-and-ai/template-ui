import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EvalDashboard } from './eval';
import { useAppSelector } from '../../redux/hooks';
import type { RootState } from '../../redux/store';

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
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/30 hover:bg-secondary/50 transition-colors text-left cursor-pointer"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

export function DeveloperSettings() {
  const branding = useAppSelector((state: RootState) => state.config.branding);

  return (
    <div className="space-y-4">
      <CollapsibleSection title="Agent Information">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Agent Version:</span>
          <code className="rounded bg-muted px-2 py-1 text-sm font-medium">
            {branding?.version ?? '—'}
          </code>
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="Agent Evaluation">
        <EvalDashboard />
      </CollapsibleSection>
    </div>
  );
}
