/**
 * Every stream path forwards subagent progress.
 *
 * There are four: submit, resume-with-decisions, resume-interrupt and
 * attach. `resumeInterrupt` was missing the callback, so connecting an
 * integration mid-turn — which resumes through exactly that path —
 * froze every delegation box at the step it had reached when the run
 * paused, while the agent carried on working behind it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  join(__dirname, 'useStreamingAPI.ts'),
  'utf8',
);

describe('subagent progress is wired on every stream path', () => {
  it('declares a callbacks object for each of the four paths', () => {
    const callbackObjects = SOURCE.match(/:\s*StreamCallback\s*=/g) ?? [];
    expect(callbackObjects.length).toBe(4);
  });

  it('forwards progress from all of them', () => {
    const handlers = SOURCE.match(/onSubagentProgress\(/g) ?? [];
    expect(handlers.length).toBe(4);
  });

  it('dispatches applySubagentProgress in each handler', () => {
    const dispatches = SOURCE.match(/applySubagentProgress\(\{ chatId: threadId/g) ?? [];
    expect(dispatches.length).toBe(4);
  });
});
