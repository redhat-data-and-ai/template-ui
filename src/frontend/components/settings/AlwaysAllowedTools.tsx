import { Button, Switch } from '@patternfly/react-core';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  selectAlwaysAllowedTools,
  selectAutoApproveAllTools,
  removeAlwaysAllowedTool,
  clearAlwaysAllowedTools,
  setAutoApproveAllTools,
} from '@/redux/slices/userSettings';

export function AlwaysAllowedTools() {
  const dispatch = useAppDispatch();
  const tools = useAppSelector(selectAlwaysAllowedTools);
  const autoApproveAll = useAppSelector(selectAutoApproveAllTools);

  return (
    <div className="space-y-6">
      {/* Auto-Approve All Tools Toggle */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold">Auto-Approve All Tools</h3>
              {autoApproveAll && (
                <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Automatically approve all tool calls without prompting
            </p>
          </div>
          <Switch
            id="auto-approve-all-switch"
            aria-label="Toggle auto-approve all tools"
            isChecked={autoApproveAll}
            onChange={(_, checked) => dispatch(setAutoApproveAllTools(checked))}
          />
        </div>
        {autoApproveAll && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs text-warning">
              ⚠️ All tools will execute automatically without approval. Individual tool permissions below are bypassed.
            </p>
          </div>
        )}
      </div>

      {/* Individual Always-Allowed Tools Section */}
      <div className={autoApproveAll ? 'opacity-50 pointer-events-none' : ''}>
        <h3 className="text-sm font-semibold mb-3">Individual Tool Permissions</h3>
        {tools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <ShieldCheck className="w-8 h-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">No tools are always allowed yet.</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              When the agent asks for approval to run a tool, click "Always allow" to skip
              approval for that tool in future runs.
            </p>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
