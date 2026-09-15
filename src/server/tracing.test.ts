import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStart = vi.fn();
const mockShutdown = vi.fn().mockResolvedValue(undefined);

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: vi.fn().mockReturnValue([]),
}));

vi.mock('@opentelemetry/exporter-metrics-otlp-http', () => ({
  OTLPMetricExporter: vi.fn(),
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  ATTR_SERVICE_NAME: 'service.name',
}));

vi.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: vi.fn().mockReturnValue({}),
}));

vi.mock('@opentelemetry/sdk-node', () => {
  return {
    NodeSDK: class MockNodeSDK {
      start = mockStart;
      shutdown = mockShutdown;
      constructor(_opts?: any) {}
    },
  };
});

vi.mock('@opentelemetry/sdk-metrics', () => ({
  PeriodicExportingMetricReader: vi.fn(),
}));

let settingsEnabled = true;

vi.mock('./utils/settings.js', () => ({
  getSettings: vi.fn().mockImplementation(() => ({
    otel: { enabled: settingsEnabled, service_name: 'test-service' },
  })),
}));

describe('tracing', () => {
  beforeEach(() => {
    vi.resetModules();
    settingsEnabled = true;
    mockStart.mockClear();
    mockShutdown.mockClear();
  });

  it('starts tracing when otel is enabled', async () => {
    const { startTracing } = await import('./tracing');
    startTracing();
    expect(mockStart).toHaveBeenCalled();
  });

  it('does not start when otel is disabled', async () => {
    settingsEnabled = false;
    const { startTracing } = await import('./tracing');
    startTracing();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('does not create a second SDK when called twice', async () => {
    const { startTracing } = await import('./tracing');
    startTracing();
    startTracing();
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('shutdownTracing calls SDK shutdown', async () => {
    const { startTracing, shutdownTracing } = await import('./tracing');
    startTracing();
    await shutdownTracing();
    expect(mockShutdown).toHaveBeenCalled();
  });

  it('shutdownTracing is safe when no SDK is running', async () => {
    settingsEnabled = false;
    const { shutdownTracing } = await import('./tracing');
    await expect(shutdownTracing()).resolves.toBeUndefined();
  });
});
