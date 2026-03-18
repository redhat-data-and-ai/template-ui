type AppData = {
  apiUrl?: string;
  drBackendUrl?: string;
};

function readAppData(): AppData {
  return (
    (globalThis as Record<string, unknown> as { APP_DATA?: AppData }).APP_DATA ??
    {}
  );
}

export function getBackendUrl(): string {
  const { apiUrl } = readAppData();
  if (apiUrl && apiUrl !== "__BACKEND_URL__") {
    return apiUrl;
  }

  const envUrl = import.meta.env?.VITE_BACKEND_URL as string | undefined;
  if (envUrl) return envUrl;

  throw new Error(
    "Backend URL not configured. Set VITE_BACKEND_URL in your .env file.",
  );
}

export function getAdapterConfig(): unknown {
  const raw = import.meta.env?.VITE_ADAPTER_CONFIG as string | undefined;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("VITE_ADAPTER_CONFIG is not valid JSON, ignoring.");
    return null;
  }
}

export function getUserId(): string {
  return (
    (
      globalThis as Record<string, unknown> as {
        USER_DATA?: { preferred_username?: string };
      }
    ).USER_DATA?.preferred_username ?? "anonymous"
  );
}
