function normalizeBasePath(value: string | undefined): string {
  const trimmed = (value || '').trim();
  if (!trimmed || trimmed === '/') return '/';
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return normalized.replace(/\/+$/, '') || '/';
}

function normalizeSuffix(path: string): string {
  if (!path || path === '/') return '';
  return path.startsWith('/') ? path : `/${path}`;
}

export function getAppBasePath(): string {
  return normalizeBasePath(globalThis.window?.APP_DATA?.basePath);
}

export function buildAppPath(path: string): string {
  const basePath = getAppBasePath();
  const suffix = normalizeSuffix(path);
  if (basePath === '/') {
    return suffix || '/';
  }
  return `${basePath}${suffix}` || basePath;
}

export function getAgentApiBaseUrl(): string {
  const apiUrl = globalThis.window?.APP_DATA?.apiUrl;
  if (typeof apiUrl === 'string' && apiUrl.trim() !== '') {
    return apiUrl.replace(/\/+$/, '');
  }
  return buildAppPath('/api/proxy/agent');
}

export function buildAgentApiUrl(path: string): string {
  return `${getAgentApiBaseUrl()}${normalizeSuffix(path)}`;
}
