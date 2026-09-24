import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { getSettings } from "./utils/settings.js";

function otlpBaseUrl(): string {
  const raw = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
  return raw.replace(/\/$/, "");
}

function createSdk(): NodeSDK {
  const cfg = getSettings();
  const traceExporter = new OTLPTraceExporter({
    url: `${otlpBaseUrl()}/v1/traces`,
  });
  const metricExporter = new OTLPMetricExporter({
    url: `${otlpBaseUrl()}/v1/metrics`,
  });

  return new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: cfg.otel.service_name,
    }),
    traceExporter,
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
      }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });
}

let sdk: NodeSDK | undefined;

export function startTracing(): void {
  const cfg = getSettings();
  if (!cfg.otel.enabled) {
    return;
  }
  if (sdk) {
    return;
  }
  sdk = createSdk();
  sdk.start();
}

export async function shutdownTracing(): Promise<void> {
  if (!sdk) {
    return;
  }
  try {
    await sdk.shutdown();
  } finally {
    sdk = undefined;
  }
}
