import { Button } from '@patternfly/react-core';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  selectAlwaysAllowedTools,
  removeAlwaysAllowedTool,
  clearAlwaysAllowedTools,
} from '@/redux/slices/userSettings';

export function AlwaysAllowedTools() {
  const dispatch = useAppDispatch();
  const tools = useAppSelector(selectAlwaysAllowedTools);

  if (tools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <ShieldCheck className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No tools are always allowed yet.</p>
        <p className="text-xs text-muted-foreground/70 max-w-xs">
          When the agent asks for approval to run a tool, click "Always allow" to skip
          approval for that tool in future runs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        These tools are automatically approved without showing an approval prompt. You can
        revoke access for any tool at any time.
      </p>

      <ul className="space-y-3">
        {tools.map((tool) => (
          <li
            key={tool}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="w-3.5 h-3.5 text-success shrink-0" />
              <code className="text-xs font-mono text-foreground truncate">{tool}</code>
            </div>
            <Button
              variant="plain"
              size="sm"
              aria-label={`Revoke always-allow for ${tool}`}
              onClick={() => dispatch(removeAlwaysAllowedTool(tool))}
              className="!p-1 text-muted-foreground hover:text-destructive shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </li>
        ))}
      </ul>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => dispatch(clearAlwaysAllowedTools())}
      >
        Revoke all
      </Button>
    </div>
  );
}
