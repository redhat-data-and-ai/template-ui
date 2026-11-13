import { useRef, useState } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import type { ApprovalSubmission, HITLActionRequest, InterruptInfo } from '../types/deep-agent';
import { extractSubAgentName, isSubAgentToolCall } from '../types/deep-agent';

type Decision = { type: 'approve' | 'reject'; message?: string };
type DecisionState = { decisions: Array<Decision | null>; submitting: boolean };

export interface ToolApproval {
  key: string;
  interruptId?: string;
  actionIndex: number;
  request: HITLActionRequest;
  disabled: boolean;
  decision: Decision | null;
  decide: (decision: Decision) => void;
  alwaysAllow?: () => void;
}

/** Keep the original per-action decision order, independent of displayed cards. */
export function useInterruptApprovals(
  interrupts: InterruptInfo[],
  disabled: boolean,
  onResume?: ApprovalSubmission,
  onAlwaysAllow?: (names: string[]) => void,
): ToolApproval[] {
  const [states, setStates] = useState<Record<string, DecisionState>>({});
  const live = useRef(states);
  function publish(key: string, value: DecisionState) {
    live.current = { ...live.current, [key]: value };
    setStates(live.current);
  }
  return interrupts.flatMap(interrupt => {
    const requests = typeof interrupt.value === 'object' ? interrupt.value?.action_requests ?? [] : [];
    const key = `${interrupt.id}:${JSON.stringify(interrupt.value)}`;
    const empty = (): DecisionState => ({ decisions: requests.map(() => null), submitting: false });
    const state = states[key] ?? empty();
    const controlsDisabled = disabled || state.submitting || !interrupt.id || !interrupt.resumable || !onResume;
    async function decide(index: number, decision: Decision) {
      const current = live.current[key] ?? empty();
      if (controlsDisabled || current.submitting || current.decisions[index]) return;
      const decisions = [...current.decisions];
      decisions[index] = decision;
      const submitting = decisions.every(item => item !== null);
      publish(key, { decisions, submitting });
      if (!submitting) return;
      try {
        await onResume!(decisions as Decision[], interrupt.id!);
      } catch {
        // A preflight rejection may not change the shared busy flag.
        publish(key, empty());
      }
    }
    return requests.map((request, index) => ({
      key: `${key}:${index}`,
      interruptId: interrupt.id,
      actionIndex: index,
      request,
      disabled: controlsDisabled,
      decision: state.decisions[index],
      decide: (decision: Decision) => { void decide(index, decision); },
      alwaysAllow: onAlwaysAllow ? () => {
        const current = live.current[key] ?? empty();
        if (controlsDisabled || current.submitting || current.decisions[index]) return;
        const name = request.name === 'task' && typeof request.args?.subagent_type === 'string'
          ? request.args.subagent_type : request.name;
        onAlwaysAllow([name]);
        void decide(index, { type: 'approve' });
      } : undefined,
    }));
  });
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
    }
    return item;
  });
}

/** Bind only an unambiguous unfinished tool call with matching name AND args. */
export function bindToolApprovals(messages: Message[], approvals: ToolApproval[]) {
  const candidates = messages.flatMap(message => message.type === 'ai' && Array.isArray(message.tool_calls)
    ? message.tool_calls.filter(call => call.id && (call as { content?: unknown }).content == null) : []);
  const bindings = new Map<string, ToolApproval>();
  const unmatched: ToolApproval[] = [];
  for (const approval of approvals) {
    const matches = candidates.filter(call => !bindings.has(call.id!) && (
      call.name === approval.request.name || (
        approval.request.name === 'task' && isSubAgentToolCall(call)
        && extractSubAgentName(call) === approval.request.args?.subagent_type
      )
    ) && canonical(call.args ?? {}) === canonical(approval.request.args ?? {}));
    if (matches.length === 1) bindings.set(matches[0].id!, approval);
    // The result may arrive before the resume stream ends and clears its interrupt.
    // An already-decided request needs no fallback card while that happens.
    else if (!approval.decision) unmatched.push(approval);
  }
  return { bindings, unmatched };
}
