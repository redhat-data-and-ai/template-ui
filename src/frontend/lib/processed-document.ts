import { citationImagesFromContent, type CitationImage } from "../../server/citation-images";
import type { DocumentReference } from "./document-references";

const MCP_SERVER = "unstructured-mcp";
const MAX_DOCUMENT_CHARS = 500_000;

export type McpToolCaller = (
  mcpName: string,
  name: string,
  args: Record<string, unknown>,
) => Promise<{ content?: unknown; isError?: boolean }>;

export type DocumentView = {
  markdown: string;
  images: CitationImage[];
};

function textOfPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  const content = (payload as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => {
    if (!block || typeof block !== "object") return "";
    if ((block as { type?: unknown }).type !== "text") return "";
    const text = (block as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }).join("\n");
}

function objectFromText(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return parsedObject(text.slice(start, index + 1));
    }
  }
  return null;
}

function parsedObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Markdown body of a get_processed_document tool result. */
export function processedDocumentMarkdown(payload: unknown): string {
  if (payload && typeof payload === "object" && (payload as { isError?: unknown }).isError === true) return "";
  const record = objectFromText(textOfPayload(payload));
  const markdown = record?.markdown_content;
  if (typeof markdown !== "string") return "";
  return decodeEntities(markdown).slice(0, MAX_DOCUMENT_CHARS);
}

const inflightMarkdown = new Map<string, Promise<string>>();
const inflightImages = new Map<string, Promise<CitationImage[]>>();
const storedImages = new Map<string, CitationImage[]>();

function imageKey(pipeline: string, chunkId: string): string {
  return `${pipeline}:${chunkId}`;
}

/** The page image, if this session already fetched it. `undefined` means it has not finished. */
export function peekPageImage(pipeline: string, chunkId: string): CitationImage | null | undefined {
  const stored = storedImages.get(imageKey(pipeline, chunkId));
  if (!stored) return undefined;
  return stored[0] ?? null;
}

export function clearCitedPageCache(): void {
  inflightImages.clear();
  storedImages.clear();
}

async function readProcessed(pipeline: string, fileId: string, callTool: McpToolCaller): Promise<string> {
  try {
    const result = await callTool(MCP_SERVER, "get_processed_document", {
      pipeline_name: pipeline,
      file_id: fileId,
    });
    return processedDocumentMarkdown(result);
  } catch {
    return "";
  }
}

async function readImages(pipeline: string, chunkId: string, callTool: McpToolCaller): Promise<CitationImage[]> {
  try {
    const result = await callTool(MCP_SERVER, "get_citation_image", {
      pipeline_name: pipeline,
      chunk_id: chunkId,
    });
    return citationImagesFromContent(result.content);
  } catch {
    return [];
  }
}

/** One in-flight fetch per document, shared if the viewer mounts twice. */
export function loadProcessedMarkdown(pipeline: string, fileId: string, callTool: McpToolCaller): Promise<string> {
  if (!pipeline || !fileId) return Promise.resolve("");
  const key = `${pipeline}:${fileId}`;
  const existing = inflightMarkdown.get(key);
  if (existing) return existing;
  const pending = readProcessed(pipeline, fileId, callTool).finally(() => {
    inflightMarkdown.delete(key);
  });
  inflightMarkdown.set(key, pending);
  return pending;
}

/** One fetch per chunk for the whole session. A later open reuses the stored image. */
export function loadPageImages(
  pipeline: string,
  chunkId: string,
  existing: CitationImage[],
  callTool: McpToolCaller,
): Promise<CitationImage[]> {
  if (existing.length > 0) return Promise.resolve(existing);
  if (!pipeline || !chunkId) return Promise.resolve([]);
  const key = imageKey(pipeline, chunkId);
  const stored = storedImages.get(key);
  if (stored) return Promise.resolve(stored);
  const current = inflightImages.get(key);
  if (current) return current;
  const pending = readImages(pipeline, chunkId, callTool).then((images) => {
    storedImages.set(key, images);
    return images;
  }).finally(() => {
    inflightImages.delete(key);
  });
  inflightImages.set(key, pending);
  return pending;
}

/** Start every cited page image while the answer is on screen, before a click. */
export function prefetchCitedPages(
  pages: readonly { pipeline: string; chunkId: string | null }[],
  callTool: McpToolCaller,
): void {
  for (const page of pages) {
    if (!page.pipeline || !page.chunkId) continue;
    void loadPageImages(page.pipeline, page.chunkId, [], callTool);
  }
}

function takePages(pages: CitationImage[][], limit = 6): CitationImage[] {
  const images: CitationImage[] = [];
  for (const page of pages) {
    for (const image of page) {
      images.push(image);
      if (images.length >= limit) return images;
    }
  }
  return images;
}

/** Page pictures in citation order. The first page is reported before the later pages return. */
export async function loadDocumentPages(
  pipeline: string,
  chunkIds: readonly string[],
  existing: CitationImage[],
  callTool: McpToolCaller,
  onUpdate?: (images: CitationImage[]) => void,
): Promise<CitationImage[]> {
  if (existing.length > 0) return existing;
  const ids = [...new Set(chunkIds.filter((id) => id.length > 0))].slice(0, 3);
  if (ids.length === 0) return [];
  const first = await loadPageImages(pipeline, ids[0], [], callTool);
  let images = takePages([first]);
  if (images.length > 0) onUpdate?.(images);
  const rest = await Promise.all(ids.slice(1).map((id) => loadPageImages(pipeline, id, [], callTool)));
  images = takePages([first, ...rest]);
  if (rest.length > 0 && images.length > 0) onUpdate?.(images);
  return images;
}

/** Full document text plus any page image the unstructured server can return. */
export async function loadDocumentView(reference: DocumentReference, callTool: McpToolCaller): Promise<DocumentView> {
  const chunkId = reference.passages.find((passage) => passage.chunkId)?.chunkId ?? "";
  const [markdown, images] = await Promise.all([
    loadProcessedMarkdown(reference.pipeline, reference.fileId, callTool),
    loadPageImages(reference.pipeline, chunkId, reference.images, callTool),
  ]);
  const fallback = reference.passages.map((passage) => passage.text).join("\n\n");
  return { markdown: markdown || fallback, images };
}
