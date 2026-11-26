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
  waitingForResume?: boolean;
  decision: Decision | null;
  decide: (decision: Decision) => void;
  alwaysAllow?: () => void;
}

export function useInterruptApprovals(
  interrupts: InterruptInfo[],
  disabled: boolean,
  onResume?: ApprovalSubmission,
  onAlwaysAllow?: (names: string[]) => void,
  isResuming = false,
  resumingInterruptId?: string | null,
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
      waitingForResume: isResuming
        && interrupt.id !== resumingInterruptId
        && interrupts.some((item) => item.id === resumingInterruptId),
      decision: state.decisions[index] ?? (
        isResuming && resumingInterruptId && interrupt.id === resumingInterruptId
          ? { type: 'approve' }
          : null
      ),
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

type ApprovalCall = {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
  content?: unknown;
  transcript?: Array<{ tool_calls?: ApprovalCall[] }>;
};

function isUnfinished(call: ApprovalCall): boolean {
  return Boolean(call.id) && call.content == null;
}

function approvalCandidates(messages: Message[]): ApprovalCall[] {
  const found: ApprovalCall[] = [];
  for (const message of messages) {
    if (message.type !== 'ai' || !Array.isArray(message.tool_calls)) continue;
    for (const raw of message.tool_calls) {
      const call = raw as ApprovalCall;
      if (isUnfinished(call)) found.push(call);
      for (const entry of call.transcript ?? []) {
        for (const inner of entry.tool_calls ?? []) {
          if (isUnfinished(inner)) found.push(inner);
        }
      }
    }
  }
  return found;
}

/** Bind only an unambiguous unfinished tool call with matching name AND args. */
export function bindToolApprovals(messages: Message[], approvals: ToolApproval[]) {
  const candidates = approvalCandidates(messages);
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
    else if (!approval.decision) unmatched.push(approval);
  }
  return { bindings, unmatched };
}
