import { useRef, useState } from 'react';
import type { ApprovalSubmission, InterruptInfo } from '../types/deep-agent';

type Decision = { type: 'approve' | 'reject'; message?: string };

interface InterruptApprovalCardProps {
  interrupt: InterruptInfo;
  disabled: boolean;
  onResume?: ApprovalSubmission;
  onAlwaysAllow?: (toolNames: string[]) => void;
}

/** Render the actual interrupt payload so tool names never determine ownership. */
export function InterruptApprovalCard({ interrupt, disabled, onResume, onAlwaysAllow }: InterruptApprovalCardProps) {
  const requests = typeof interrupt.value === 'object' ? interrupt.value.action_requests : [];
  const [decisions, setDecisions] = useState<Array<Decision | null>>(() => requests.map(() => null));
  const decisionsRef = useRef(decisions);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const controlsDisabled = disabled || submitting || !interrupt.id || !interrupt.resumable || !onResume;

  async function decide(index: number, decision: Decision): Promise<void> {
    if (controlsDisabled || submittingRef.current || decisionsRef.current[index]) return;
    const next = [...decisionsRef.current];
    next[index] = decision;
    decisionsRef.current = next;
    setDecisions(next);
    if (!next.every(item => item !== null)) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onResume!(next as Decision[], interrupt.id!);
    } catch {
      // A preflight rejection may happen before the shared busy state changes.
      // Restore all controls so a deliberate retry remains possible.
      const empty = requests.map(() => null);
      decisionsRef.current = empty;
      setDecisions(empty);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section data-interrupt-id={interrupt.id} aria-label="Pending tool approval" className="mx-4 mb-3 rounded-lg border border-yellow-500/60 p-4 space-y-3">
      <h3 className="font-medium">Approval required</h3>
      {requests.map((request, index) => (
        <div key={index} data-action-index={index} className="space-y-2">
          <strong>{request.name}</strong>
          <pre className="text-xs overflow-auto whitespace-pre-wrap">{JSON.stringify(request.args, null, 2)}</pre>
          {decisions[index] ? (
            <p role="status">{decisions[index]?.type === 'approve' ? 'Approved' : 'Rejected'}</p>
          ) : (
            <div className="flex gap-2">
              <button type="button" disabled={controlsDisabled} className="px-3 py-1 rounded border" onClick={() => void decide(index, { type: 'approve' })}>Approve</button>
              <button type="button" disabled={controlsDisabled} className="px-3 py-1 rounded border" onClick={() => void decide(index, { type: 'reject', message: 'User rejected this action.' })}>Reject</button>
              {onAlwaysAllow && (
                <button type="button" disabled={controlsDisabled} className="px-3 py-1 rounded border" onClick={() => {
                  if (controlsDisabled || submittingRef.current || decisionsRef.current[index]) return;
                  const name = request.name === 'task' && typeof request.args?.subagent_type === 'string'
                    ? request.args.subagent_type : request.name;
                  onAlwaysAllow([name]);
                  void decide(index, { type: 'approve' });
                }}>Always allow</button>
              )}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
