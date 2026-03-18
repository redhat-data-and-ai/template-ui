export interface EndpointConfig {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  bodyMapping?: Record<string, string | boolean | number | Record<string, unknown>>;
}

export interface StreamConfig {
  mode: "direct" | "two-step";
  streamUrlField?: string;
  chunkFormat: "passthrough" | "sse";
}

export interface EventMappingEntry {
  stage: string;
  eventType: string;
  messageField: string;
  displayTextField?: string;
  reportField?: string;
  uiVisible?: boolean;
}

export interface AdapterConfigSchema {
  name: string;

  features: {
    planApproval: boolean;
    steering: boolean;
    modelSelection: boolean;
  };

  endpoints: {
    start: EndpointConfig;
    cancel: EndpointConfig;
    steering?: EndpointConfig;
    planApproval?: EndpointConfig;
  };

  stream: StreamConfig;

  eventMapping?: Record<string, EventMappingEntry | "ignore">;

  eventTypeField?: string;
  dataField?: string;
  timestampField?: string;
}
