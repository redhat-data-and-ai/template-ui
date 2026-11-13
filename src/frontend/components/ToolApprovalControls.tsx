import { Check, ShieldCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ToolApproval } from '../hooks/useInterruptApprovals';

/** Preserve the original inline approval toolbar and its button styles. */
export function ToolApprovalControls({ approval }: { approval: ToolApproval }) {
  const approveRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Interrupts can arrive before stream EOF, while decisions are disabled.
    // Focus when approval becomes available, rather than only on mount.
    if (!approval.disabled && !approval.decision) approveRef.current?.focus({ preventScroll: true });
  }, [approval.disabled, approval.decision]);
  if (approval.decision) return null;
  const name = approval.request.name;
  return (
    <div role="alert" aria-live="assertive" aria-label={`Tool call ${name} requires approval`} className="flex items-center gap-2 px-4 py-3 border-t border-yellow-500/30 bg-yellow-500/5 flex-wrap">
      <button ref={approveRef} type="button" disabled={approval.disabled} onClick={() => approval.decide({ type: 'approve' })}
        aria-label={`Approve tool call: ${name}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{ backgroundColor: 'var(--chart-3)', color: 'var(--background)' }}>
        <Check className="w-3 h-3" aria-hidden="true" />Approve
      </button>
      <button type="button" disabled={approval.disabled} onClick={() => approval.decide({ type: 'reject', message: 'User rejected this action.' })}
        aria-label={`Reject tool call: ${name}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition-colors"
        style={{ backgroundColor: 'var(--destructive)', color: 'var(--background)' }}>Reject</button>
      {approval.alwaysAllow && (
        <button type="button" disabled={approval.disabled} onClick={approval.alwaysAllow}
          aria-label={`Always allow tool: ${name}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-muted text-foreground hover:bg-muted/70 transition-colors">
          <ShieldCheck className="w-3 h-3" aria-hidden="true" />Always allow
        </button>
      )}
    </div>
  );
}
