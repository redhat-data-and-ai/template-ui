import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithTimeout, DETECT_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from "../shared/fetch";

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exports expected timeout constants", () => {
    expect(DETECT_TIMEOUT_MS).toBe(5_000);
    expect(REQUEST_TIMEOUT_MS).toBe(30_000);
  });

  it("calls fetch with the provided URL and options", async () => {
    const mockResponse = new Response("ok");
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(mockResponse);

    const promise = fetchWithTimeout("https://example.com/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const result = await promise;
    expect(result).toBe(mockResponse);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/api");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("aborts the request when timeout expires", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        (init as RequestInit).signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const promise = fetchWithTimeout("https://slow.example.com", undefined, 100);

    vi.advanceTimersByTime(100);

    await expect(promise).rejects.toThrow("Aborted");
  });

  it("uses default timeout of DETECT_TIMEOUT_MS", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        (init as RequestInit).signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const promise = fetchWithTimeout("https://slow.example.com");

    vi.advanceTimersByTime(DETECT_TIMEOUT_MS - 1);
    await vi.advanceTimersByTimeAsync(0);

    vi.advanceTimersByTime(1);
    await expect(promise).rejects.toThrow();
  });

  it("clears the timeout on successful response", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("ok"));

    await fetchWithTimeout("https://example.com");

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
