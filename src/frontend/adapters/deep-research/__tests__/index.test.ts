import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../config", () => ({
  getBackendUrl: vi.fn(() => "http://localhost:5002"),
}));

vi.mock("../protocols/langgraph", () => ({
  detect: vi.fn(),
}));

vi.mock("../protocols/api-probe", () => ({
  detect: vi.fn(),
}));

import { getAdapterAsync, getAdapter, isAdapterReady, resetAdapterCache } from "../index";
import { detect as tryLangGraph } from "../protocols/langgraph";
import { detect as tryApiProbe } from "../protocols/api-probe";

const mockAdapter = {
  name: "test-adapter",
  features: { planApproval: false, steering: false, modelSelection: false },
  startResearch: vi.fn(),
  cancelResearch: vi.fn(),
  normalizeChunk: vi.fn(),
};

describe("adapter discovery", () => {
  beforeEach(() => {
    resetAdapterCache();
    vi.mocked(tryLangGraph).mockReset();
    vi.mocked(tryApiProbe).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("discovers adapter via LangGraph protocol first", async () => {
    vi.mocked(tryLangGraph).mockResolvedValueOnce(mockAdapter);
    vi.mocked(tryApiProbe).mockResolvedValueOnce(null);

    const adapter = await getAdapterAsync();
    expect(adapter).toBe(mockAdapter);
    expect(adapter.name).toBe("test-adapter");
  });

  it("discovers adapter via API probe when LangGraph fails", async () => {
    vi.mocked(tryLangGraph).mockResolvedValueOnce(null);
    vi.mocked(tryApiProbe).mockResolvedValueOnce(mockAdapter);

    const adapter = await getAdapterAsync();
    expect(adapter).toBe(mockAdapter);
  });

  it("throws when no backend is found", async () => {
    vi.mocked(tryLangGraph).mockResolvedValueOnce(null);
    vi.mocked(tryApiProbe).mockResolvedValueOnce(null);

    await expect(getAdapterAsync()).rejects.toThrow("No compatible backend found");
  });

  it("caches the discovered adapter", async () => {
    vi.mocked(tryLangGraph).mockResolvedValueOnce(mockAdapter);
    vi.mocked(tryApiProbe).mockResolvedValueOnce(null);

    const first = await getAdapterAsync();
    const second = await getAdapterAsync();

    expect(first).toBe(second);
    expect(tryLangGraph).toHaveBeenCalledTimes(1);
  });

  it("isAdapterReady returns false before discovery", () => {
    expect(isAdapterReady()).toBe(false);
  });

  it("isAdapterReady returns true after discovery", async () => {
    vi.mocked(tryLangGraph).mockResolvedValueOnce(mockAdapter);
    vi.mocked(tryApiProbe).mockResolvedValueOnce(null);

    await getAdapterAsync();
    expect(isAdapterReady()).toBe(true);
  });

  it("getAdapter throws when not yet discovered", () => {
    expect(() => getAdapter()).toThrow("Adapter not yet discovered");
  });

  it("getAdapter returns cached adapter", async () => {
    vi.mocked(tryLangGraph).mockResolvedValueOnce(mockAdapter);
    vi.mocked(tryApiProbe).mockResolvedValueOnce(null);

    await getAdapterAsync();
    expect(getAdapter()).toBe(mockAdapter);
  });

  it("resetAdapterCache clears the cache", async () => {
    vi.mocked(tryLangGraph).mockResolvedValue(mockAdapter);
    vi.mocked(tryApiProbe).mockResolvedValue(null);

    await getAdapterAsync();
    expect(isAdapterReady()).toBe(true);

    resetAdapterCache();
    expect(isAdapterReady()).toBe(false);
  });

  it("includes error details when detectors reject", async () => {
    vi.mocked(tryLangGraph).mockRejectedValueOnce(new Error("Connection refused"));
    vi.mocked(tryApiProbe).mockResolvedValueOnce(null);

    await expect(getAdapterAsync()).rejects.toThrow("Connection refused");
  });
});
