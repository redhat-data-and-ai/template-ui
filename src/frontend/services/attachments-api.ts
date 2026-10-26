import { buildAgentApiUrl } from '../lib/app-paths';

export interface Attachment {
  filename: string;
  path: string;
  bytes: number;
  text_extracted: boolean;
  truncated: boolean;
  /** Which parser read the file: `builtin`, `docling`, `tika`, `transcription`. */
  engine?: string;
  /**
   * Set when a configured extraction engine was meant to run and did
   * not. Shown rather than swallowed: a fallback nobody can see is
   * indistinguishable from the thing working.
   */
  degraded?: string | null;
}

export interface UploadResponse {
  attachments: Attachment[];
  /** One line per file, suitable for prepending to the user's message. */
  summary: string;
}

/**
 * Attach files to a thread.
 *
 * Limits are enforced server-side — this deliberately does not
 * pre-validate size or type beyond what the file picker already does.
 * A client-side check that disagrees with the server's is worse than
 * no check, because it teaches users rules that are not the real ones.
 */
export async function uploadAttachments(
  threadId: string,
  files: File[],
): Promise<UploadResponse> {
  const body = new FormData();
  for (const file of files) body.append('files', file);

  const response = await fetch(buildAgentApiUrl(`/threads/${threadId}/attachments`), {
    method: 'POST',
    body,
  });

  if (!response.ok) {
    // The server's message names the file and the limit it broke;
    // replacing it with a generic string loses the only useful part.
    let detail = `Upload failed (${response.status})`;
    try {
      const body = await response.json();
      // The agent's error handler returns {error, message, details};
      // FastAPI's default returns {detail}. Reading only one of them
      // discarded the server's message and left the user with a bare
      // status code.
      const served = body?.detail ?? body?.message;
      if (served) detail = String(served);
    } catch {
      /* non-JSON error body; keep the status */
    }
    throw new Error(detail);
  }
  return response.json();
}

export async function listAttachments(threadId: string): Promise<Attachment[]> {
  const response = await fetch(buildAgentApiUrl(`/threads/${threadId}/attachments`), {
    cache: 'no-store',
  });
  if (!response.ok) return [];
  return (await response.json()).attachments ?? [];
}
