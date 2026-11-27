import { useState, useEffect } from 'react';

/** Reactively tracks whether the document root has the `dark` CSS class. */
export function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

const METRIC_LABELS: Record<string, string> = {
  // Custom metrics
  'custom:answer_correctness':               'Response Accuracy',
  'custom:tool_eval':                        'Actions Taken',
  'custom:intent_eval':                      'Goal Understanding',
  'custom:keywords_eval':                    'Key Terms Present',
  'custom:proposal_evaluation_correctness':  'Proposal Quality',

  // GEval
  'geval:tone_safety':          'Safe & Professional Tone',
  'geval:technical_accuracy':   'Technical Accuracy',
  'geval:delegation_compliance':'Delegation Compliance',
  'geval:conversation_coherence': 'Conversation Flow',

  // Ragas
  'ragas:faithfulness':                          'Grounded in Facts',
  'ragas:response_relevancy':                    'Response Relevance',
  'ragas:context_recall':                        'Context Coverage',
  'ragas:context_precision_with_reference':      'Context Precision',
  'ragas:context_precision_without_reference':   'Context Precision',
  'ragas:context_relevance':                     'Context Relevance',

  // DeepEval
  'deepeval:knowledge_retention':         'Memory Across Turns',
  'deepeval:conversation_completeness':   'Conversation Completeness',
  'deepeval:conversation_relevancy':      'Response on Topic',

  // NLP
  'nlp:bleu':                       'Text Similarity (BLEU)',
  'nlp:rouge':                      'Text Overlap (ROUGE)',
  'nlp:semantic_similarity_distance': 'Semantic Similarity',

  // Script
  'script:action_eval': 'Action Validation',
};

const toTitleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Converts a namespaced metric identifier (e.g. `custom:answer_correctness`) into a human-readable label. */
export function friendlyMetricName(key: string): string {
  if (METRIC_LABELS[key]) return METRIC_LABELS[key];
  return toTitleCase(key.replace(/^(custom|geval|deepeval|nlp|ragas|script):/, ''));
}

/** Strips the trailing UUID suffix from a conversation key and converts underscores to title case. */
export function friendlyConversationName(key: string): string {
  return toTitleCase(key.replace(/_[a-f0-9]{12}$/, ''));
}


/** Computes the rounded percentage-point change between two 0-1 scores and its direction. */
export function computeDelta(
  current: number,
  previous: number,
): { value: number; direction: 'up' | 'down' | 'same' } {
  const diff = Math.round((current - previous) * 100);
  if (diff > 0) return { value: diff, direction: 'up' };
  if (diff < 0) return { value: Math.abs(diff), direction: 'down' };
  return { value: 0, direction: 'same' };
}

/** Converts a snake_case tag string to Title Case for display. */
export function friendlyTagName(tag: string): string {
  return toTitleCase(tag);
}

const TERMINAL_EVAL_STATUSES = new Set(['completed', 'failed', 'error', 'no_dataset']);

/** True only while an eval is actually running (or the trigger request is in flight). */
export function isLiveEvalRun(opts: {
  evalStatus: string;
  triggerStatus: string;
}): boolean {
  if (opts.evalStatus === 'in_progress') {
    return true;
  }
  if (opts.triggerStatus === 'loading' && !TERMINAL_EVAL_STATUSES.has(opts.evalStatus)) {
    return true;
  }
  return false;
}

const CACHED_RESULT_MESSAGE =
  'Result already exists — eval completed. Showing latest result.';

/** Checks whether a value represents a truthy cached-result flag from the eval trigger response. */
function isCachedFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

/** Message when trigger 200 means a finished run, not a new live run. */
export function evalTriggerDoneMessage(data: {
  cached?: unknown;
  eval_status?: string;
}): string | null {
  // A 200 from /trigger with completed status is always a cache hit (new runs
  // return in_progress). Keep this even if the cached flag is stripped.
  if (isCachedFlag(data.cached) || data.eval_status === 'completed') {
    return CACHED_RESULT_MESSAGE;
  }
  return null;
}
