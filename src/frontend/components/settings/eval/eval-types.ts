export type EvalStatus = 'idle' | 'loading' | 'success' | 'error';

export interface ActionState {
  status: EvalStatus;
  message: string;
}

export const INITIAL_ACTION: ActionState = { status: 'idle', message: '' };

export interface ScoreStatistics {
  mean?: number;
  min?: number;
  max?: number;
  std?: number;
}

export interface MetricStats {
  pass?: number;
  fail?: number;
  pass_rate?: number;
  score_statistics?: ScoreStatistics;
}

export interface OverallStats {
  PASS?: number;
  FAIL?: number;
  ERROR?: number;
  pass_rate?: number;
}

export interface ConvStats {
  pass?: number;
  fail?: number;
}

export interface SummaryStats {
  overall?: OverallStats;
  by_metric?: Record<string, MetricStats>;
  by_conversation?: Record<string, ConvStats>;
}

export interface EvalSummary {
  total_evaluations?: number;
  summary_stats?: SummaryStats;
}

export interface Turn {
  conversation_group_id?: string;
  tag?: string;
  turn_id?: string;
  metric_identifier?: string;
  result?: string;
  score?: string;
  threshold?: string;
  reason?: string;
  query?: string;
  response?: string;
  tool_calls?: string;
  expected_tool_calls?: string;
}

export interface ResultsDetail {
  run_id?: string;
  eval_status?: string;
  eval_score?: number;
  pass?: number;
  fail?: number;
  error?: number;
  summary?: EvalSummary;
  turns?: Turn[];
}

export interface EvalRow {
  eval_status?: string;
  eval_score?: number;
  pass?: number;
  fail?: number;
  error?: number;
  results_detail?: ResultsDetail;
  created_at?: string;
  completed_at?: string;
}

export interface EvalHistoryRun {
  eval_score: number;
  pass: number;
  fail: number;
  error: number;
  config_hash: string;
  created_at: string;
  completed_at: string;
}

export interface EvalHistoryResponse {
  runs: EvalHistoryRun[];
  total: number;
}

export interface MetricTrendPoint {
  completed_at: string;
  pass_rate: number | null;
}

export interface EvalTrendsResponse {
  metrics: Record<string, MetricTrendPoint[]>;
  overall: { completed_at: string; eval_score: number }[];
}
