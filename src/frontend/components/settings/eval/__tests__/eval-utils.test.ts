import {
  friendlyMetricName,
  friendlyConversationName,
  computeDelta,
  isLiveEvalRun,
  evalTriggerDoneMessage,
} from '../eval-utils';

describe('friendlyMetricName', () => {
  it('returns human-readable labels for known custom metrics', () => {
    expect(friendlyMetricName('custom:answer_correctness')).toBe('Response Accuracy');
    expect(friendlyMetricName('custom:tool_eval')).toBe('Actions Taken');
    expect(friendlyMetricName('custom:intent_eval')).toBe('Goal Understanding');
    expect(friendlyMetricName('custom:keywords_eval')).toBe('Key Terms Present');
  });

  it('returns human-readable labels for known ragas metrics', () => {
    expect(friendlyMetricName('ragas:faithfulness')).toBe('Grounded in Facts');
    expect(friendlyMetricName('ragas:response_relevancy')).toBe('Response Relevance');
    expect(friendlyMetricName('ragas:context_recall')).toBe('Context Coverage');
  });

  it('returns human-readable labels for known geval metrics', () => {
    expect(friendlyMetricName('geval:tone_safety')).toBe('Safe & Professional Tone');
    expect(friendlyMetricName('geval:technical_accuracy')).toBe('Technical Accuracy');
    expect(friendlyMetricName('geval:delegation_compliance')).toBe('Delegation Compliance');
  });

  it('returns human-readable labels for known deepeval metrics', () => {
    expect(friendlyMetricName('deepeval:knowledge_retention')).toBe('Memory Across Turns');
    expect(friendlyMetricName('deepeval:conversation_completeness')).toBe('Conversation Completeness');
    expect(friendlyMetricName('deepeval:conversation_relevancy')).toBe('Response on Topic');
  });

  it('strips namespace prefix and converts snake_case for unknown metrics', () => {
    expect(friendlyMetricName('custom:my_new_metric')).toBe('My New Metric');
    expect(friendlyMetricName('geval:some_check')).toBe('Some Check');
    expect(friendlyMetricName('ragas:new_scorer')).toBe('New Scorer');
  });

  it('converts bare snake_case identifiers with no namespace', () => {
    expect(friendlyMetricName('unknown_metric')).toBe('Unknown Metric');
    expect(friendlyMetricName('simple')).toBe('Simple');
  });
});

describe('friendlyConversationName', () => {
  it('strips a trailing 12-char hex hash from conversation IDs', () => {
    expect(friendlyConversationName('bmi_calculation_abc123def456')).toBe('Bmi Calculation');
    expect(friendlyConversationName('multi_turn_flow_ff00aa112233')).toBe('Multi Turn Flow');
  });

  it('title-cases the name when there is no hash suffix', () => {
    expect(friendlyConversationName('simple_name')).toBe('Simple Name');
    expect(friendlyConversationName('bmi_flow')).toBe('Bmi Flow');
  });

  it('preserves names that look like hex but have no underscore separator', () => {
    // Regex requires _<12hex> — no underscore means no stripping
    expect(friendlyConversationName('abc123def456')).toBe('Abc123def456');
  });
});

describe('computeDelta', () => {
  it('returns up when current score is higher', () => {
    expect(computeDelta(0.9, 0.7)).toEqual({ value: 20, direction: 'up' });
  });

  it('returns down when current score is lower', () => {
    expect(computeDelta(0.6, 0.8)).toEqual({ value: 20, direction: 'down' });
  });

  it('returns same when scores are equal', () => {
    expect(computeDelta(0.75, 0.75)).toEqual({ value: 0, direction: 'same' });
  });

  it('rounds the delta value to whole percentage points', () => {
    // 0.857 - 0.750 = 0.107 → rounds to 11pp
    expect(computeDelta(0.857, 0.750)).toEqual({ value: 11, direction: 'up' });
  });

  it('handles zero-to-positive improvement', () => {
    expect(computeDelta(0.5, 0.0)).toEqual({ value: 50, direction: 'up' });
  });
});

describe('isLiveEvalRun', () => {
  it('is true while status is in_progress', () => {
    expect(isLiveEvalRun({ evalStatus: 'in_progress', triggerStatus: 'idle' })).toBe(true);
  });

  it('is false for idle not_started (no runs yet, not a live run)', () => {
    expect(isLiveEvalRun({ evalStatus: 'not_started', triggerStatus: 'idle' })).toBe(false);
    expect(isLiveEvalRun({ evalStatus: 'not_started', triggerStatus: 'success' })).toBe(false);
  });

  it('is true while trigger is loading and status is not terminal', () => {
    expect(isLiveEvalRun({ evalStatus: 'unknown', triggerStatus: 'loading' })).toBe(true);
  });

  it('is false when eval completed', () => {
    expect(isLiveEvalRun({ evalStatus: 'completed', triggerStatus: 'loading' })).toBe(false);
    expect(isLiveEvalRun({ evalStatus: 'completed', triggerStatus: 'success' })).toBe(false);
  });

  it('is false when eval failed', () => {
    expect(isLiveEvalRun({ evalStatus: 'failed', triggerStatus: 'loading' })).toBe(false);
    expect(isLiveEvalRun({ evalStatus: 'error', triggerStatus: 'idle' })).toBe(false);
  });
});

describe('evalTriggerDoneMessage', () => {
  it('says result already exists when the trigger returns a cached completed run', () => {
    expect(evalTriggerDoneMessage({ cached: true })).toBe(
      'Result already exists — eval completed. Showing latest result.',
    );
  });

  it('says result already exists when trigger returns completed without a cached flag', () => {
    expect(evalTriggerDoneMessage({ eval_status: 'completed' })).toBe(
      'Result already exists — eval completed. Showing latest result.',
    );
  });

  it('treats cached as true when the backend sends a string flag', () => {
    expect(evalTriggerDoneMessage({ cached: 'true' as unknown as boolean })).toBe(
      'Result already exists — eval completed. Showing latest result.',
    );
  });

  it('returns null for a queued in-progress run', () => {
    expect(evalTriggerDoneMessage({ eval_status: 'in_progress' })).toBeNull();
  });
});
