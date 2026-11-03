import { describe, expect, it } from 'vitest';
import { NestedStreamTracker } from './nested-stream';

const ORCH_MODEL = 'model:d21ded86-3ad6-5d56-37f8-9bc5a9f3adb4';
const ORCH_TOOLS = 'tools:92e83ec9-e50e-07e6-ea40-1dc451c09290';
const SUBAGENT = 'tools:92e83ec9-e50e-07e6-ea40-1dc451c09290|model:abc';

const meta = (runId: string, ns: string, agent: string) => ({
  [runId]: { metadata: { langgraph_checkpoint_ns: ns, lc_agent_name: agent } },
});
const partial = (runId: string, content = 'some text') => [{ id: runId, type: 'ai', content }];

describe('NestedStreamTracker', () => {
  it('lets the orchestrator model stream through', () => {
    const t = new NestedStreamTracker();
    t.observeMetadata(meta('run-1', ORCH_MODEL, 'orchestrator'));
    expect(t.isNested(partial('run-1'))).toBe(false);
  });

  it('lets the orchestrator tools stream through', () => {
    // `tools:<id>` with no pipe is still the main graph — that is the
    // task result, which belongs in the transcript.
    const t = new NestedStreamTracker();
    t.observeMetadata(meta('run-2', ORCH_TOOLS, 'orchestrator'));
    expect(t.isNested(partial('run-2'))).toBe(false);
  });

  it('holds back a subagent model stream', () => {
    // One graph deeper. Appending this produced the answer repeated,
    // each copy longer, because both streams are cumulative.
    const t = new NestedStreamTracker();
    t.observeMetadata(meta('run-3', SUBAGENT, 'summariser'));
    expect(t.isNested(partial('run-3'))).toBe(true);
  });

  it('remembers the namespace across later chunks', () => {
    // The namespace is announced once and never repeated, so the
    // chunks that follow carry only a run id.
    const t = new NestedStreamTracker();
    t.observeMetadata(meta('run-4', SUBAGENT, 'summariser'));
    expect(t.isNested(partial('run-4', 'first'))).toBe(true);
    expect(t.isNested(partial('run-4', 'first and second'))).toBe(true);
  });

  it('names the subagent so progress can be labelled', () => {
    const t = new NestedStreamTracker();
    t.observeMetadata(meta('run-5', SUBAGENT, 'investigator'));
    expect(t.agentOf(partial('run-5'))).toBe('investigator');
  });

  it('treats an unseen run id as top level', () => {
    // Fail open: a dropped transcript chunk is a missing answer,
    // which is worse than a duplicated progress line.
    const t = new NestedStreamTracker();
    expect(t.isNested(partial('never-seen'))).toBe(false);
  });

  it('survives malformed metadata', () => {
    const t = new NestedStreamTracker();
    t.observeMetadata(null);
    t.observeMetadata({ 'run-6': {} });
    t.observeMetadata({ 'run-7': { metadata: { langgraph_checkpoint_ns: 42 } } });
    expect(t.isNested(partial('run-6'))).toBe(false);
    expect(t.isNested(partial('run-7'))).toBe(false);
  });

  it('keeps two subagents apart', () => {
    const t = new NestedStreamTracker();
    t.observeMetadata(meta('run-8', `${ORCH_TOOLS}|model:x`, 'curator'));
    t.observeMetadata(meta('run-9', `${ORCH_TOOLS}|model:y`, 'workspace'));
    expect(t.agentOf(partial('run-8'))).toBe('curator');
    expect(t.agentOf(partial('run-9'))).toBe('workspace');
  });
});
