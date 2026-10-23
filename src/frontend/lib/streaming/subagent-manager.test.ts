import { describe, expect, it, vi } from 'vitest';
import { SSEProcessor } from './SSEProcessor';
import { StreamingManager } from './StreamingManager';

/**
 * Raw SSE bytes through to the callback.
 *
 * Every piece either side of this join was tested and the box still
 * showed "processing", so this pins the join itself.
 */
describe('subagent progress reaches the callback', () => {
  it('dispatches a parsed event', () => {
    const onSubagentProgress = vi.fn();
    const manager = new StreamingManager();
    const processor = new SSEProcessor();

    const raw =
      'event: subagent_progress\n' +
      'data: {"ns":"agent:summariser","agent":"summariser","latest":"Workpilot serves"}\n\n';

    // @ts-expect-error reaching the private dispatcher on purpose:
    // the public entry point needs a fetch, and the join under test
    // is events -> callbacks.
    manager.handleEvents(processor.feed(raw), { onError: vi.fn(), onSubagentProgress });

    expect(onSubagentProgress).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'summariser', latest: 'Workpilot serves' }),
    );
  });

  it('keeps the agent name through the whole hop', () => {
    // Dropped here once already: SSEProcessor parsed the payload but
    // omitted `agent`, so the box could not tell which of the two
    // progress entries was its own.
    const onSubagentProgress = vi.fn();
    const manager = new StreamingManager();
    const processor = new SSEProcessor();
    const raw =
      'event: subagent_progress\ndata: {"ns":"agent:curator","agent":"curator"}\n\n';

    // @ts-expect-error see above.
    manager.handleEvents(processor.feed(raw), { onError: vi.fn(), onSubagentProgress });

    expect(onSubagentProgress.mock.calls[0][0].agent).toBe('curator');
  });
});
