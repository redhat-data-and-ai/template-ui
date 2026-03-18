import type { DeepResearchEvent } from "../../types/chat";

export interface DRStreamHandle {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  streamId?: string;
}

export interface DRRequestParams {
  message: string;
  threadId: string;
  sessionId: string;
  userId: string;
  token?: string;
  signal?: AbortSignal;
}

export interface PlanApprovalParams extends DRRequestParams {
  plan: string[];
}

export interface AdapterFeatures {
  planApproval: boolean;
  steering: boolean;
  modelSelection: boolean;
}

export type NormalizedChunk =
  | { type: "deep_research_status"; content: DeepResearchEvent; chunk_id?: number }
  | { type: "token"; content: string; chunk_id?: number }
  | { type: "message"; content: Record<string, unknown>; chunk_id?: number }
  | { type: "error"; content: { message: string }; chunk_id?: number };

export interface DeepResearchAdapter {
  readonly name: string;
  readonly features: AdapterFeatures;

  startResearch(params: DRRequestParams): Promise<DRStreamHandle>;
  cancelResearch(threadId: string, token?: string): Promise<void>;
  normalizeChunk(rawLine: string): NormalizedChunk | NormalizedChunk[] | null;

  approvePlan?(params: PlanApprovalParams): Promise<DRStreamHandle>;
  sendSteeringMessage?(sessionId: string, message: string): Promise<unknown>;
}
