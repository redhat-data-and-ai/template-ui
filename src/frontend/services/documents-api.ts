import { buildAgentApiUrl } from '../lib/app-paths';

export interface DocumentFile {
  path: string;
  bytes: number;
  modified: number;
}

export interface DocumentUsage {
  used_bytes: number;
  capacity_bytes: number;
  percent_used: number;
  /** The agent's own judgement that the volume is filling up. */
  warning: boolean;
}

export interface DocumentContent {
  path: string;
  bytes: number;
  content: string;
  truncated: boolean;
  /** False for a truncated file: saving back would lose the rest. */
  editable: boolean;
}

async function json<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    let detail = `${fallback} (${response.status})`;
    try {
      const body = await response.json();
      // The agent's error handler returns {error, message, details};
      // FastAPI's default returns {detail}. Reading only one of them
      // discards the server's message — and here that message is the
      // useful part, naming the file and the limit it broke.
      const served = body?.detail ?? body?.message;
      if (served) detail = String(served);
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return response.json();
}

export async function listDocuments(): Promise<{
  documents: DocumentFile[];
  usage: DocumentUsage | null;
}> {
  const res = await fetch(buildAgentApiUrl('/documents'), { cache: 'no-store' });
  const body = await json<{ documents?: DocumentFile[]; usage?: DocumentUsage }>(
    res,
    'Could not load documents',
  );
  return {
    documents: Array.isArray(body.documents) ? body.documents : [],
    usage: body.usage ?? null,
  };
}

export async function readDocument(path: string): Promise<DocumentContent> {
  const res = await fetch(
    buildAgentApiUrl(`/documents/${encodeURIComponent(path)}`),
    { cache: 'no-store' },
  );
  return json(res, `Could not read ${path}`);
}

export async function writeDocument(
  path: string,
  content: string,
): Promise<void> {
  const res = await fetch(
    buildAgentApiUrl(`/documents/${encodeURIComponent(path)}`),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    },
  );
  await json(res, `Could not save ${path}`);
}

export async function uploadDocuments(files: File[]): Promise<void> {
  const body = new FormData();
  for (const file of files) body.append('files', file);
  const res = await fetch(buildAgentApiUrl('/documents'), {
    method: 'POST',
    body,
  });
  await json(res, 'Upload failed');
}

export async function deleteDocument(path: string): Promise<void> {
  const res = await fetch(
    buildAgentApiUrl(`/documents/${encodeURIComponent(path)}`),
    { method: 'DELETE' },
  );
  await json(res, `Could not delete ${path}`);
}

/** Bytes as something a person reads at a glance. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
