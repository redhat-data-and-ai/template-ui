import type { DeepResearchAdapter } from "./types";
import { detect as tryLangGraph } from "./protocols/langgraph";
import { detect as tryApiProbe } from "./protocols/api-probe";
import { getBackendUrl } from "../../config";

export type { DeepResearchAdapter, AdapterFeatures, NormalizedChunk } from "./types";
export type { DRRequestParams, DRStreamHandle, PlanApprovalParams } from "./types";

type Detector = (url: string) => Promise<DeepResearchAdapter | null>;
const detectors: Detector[] = [tryLangGraph, tryApiProbe];

/**
 * Module-level singleton state for adapter discovery.
 * Intentional for a client-only SPA (no SSR) -- the cached adapter must
 * survive React re-renders and StrictMode double-invocations.
 * Use {@link resetAdapterCache} for test isolation.
 */
let cachedAdapter: DeepResearchAdapter | null = null;
let cachedUrl = "";
let discoveryInFlight: Promise<DeepResearchAdapter> | null = null;

async function discoverAdapter(backendUrl: string): Promise<DeepResearchAdapter> {
  const results = await Promise.allSettled(detectors.map((d) => d(backendUrl)));

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) return result.value;
  }

  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

  throw new Error(
    `No compatible backend found at ${backendUrl}${errors.length ? `: ${errors.join("; ")}` : ""}`,
  );
}

export async function getAdapterAsync(): Promise<DeepResearchAdapter> {
  const url = getBackendUrl();

  if (cachedAdapter && cachedUrl === url) return cachedAdapter;

  if (discoveryInFlight !== null && cachedUrl === url) return discoveryInFlight;

  cachedAdapter = null;
  cachedUrl = url;
  discoveryInFlight = discoverAdapter(url)
    .then((adapter) => {
      cachedAdapter = adapter;
      discoveryInFlight = null;
      return adapter;
    })
    .catch((err: unknown) => {
      console.error("Adapter discovery failed, check backend URL:", err);
      cachedUrl = "";
      discoveryInFlight = null;
      throw err;
    });

  return discoveryInFlight;
}

export function getAdapter(): DeepResearchAdapter {
  if (cachedAdapter) return cachedAdapter;

  throw new Error(
    "Adapter not yet discovered. Call getAdapterAsync() first during app initialization.",
  );
}

export function isAdapterReady(): boolean {
  return cachedAdapter !== null;
}

export function resetAdapterCache(): void {
  cachedAdapter = null;
  cachedUrl = "";
  discoveryInFlight = null;
}
