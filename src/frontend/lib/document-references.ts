import type { CitationImage } from "../../server/citation-images";

export type DocumentPassage = {
  page: number | null;
  text: string;
  chunkId: string | null;
};

export type DocumentReference = {
  fileId: string;
  title: string;
  pipeline: string;
  pages: number[];
  passages: DocumentPassage[];
  images: CitationImage[];
};

const MAX_DOCUMENTS = 8;
const MAX_PASSAGES = 8;
const CHUNK_FILE = /(?:^|\/)([A-Za-z0-9_-]{25,})\.pdf(?:#(\d+))?$/i;
const CHUNK_PATH = /pipelines\/([A-Za-z0-9_-]+)\/[^\s)"']+?\.pdf#\d+/g;
const CHUNK_ID_FIELD = /"chunk_id"\s*:\s*"([^"]+)"/g;
const MAX_WARM_PAGES = 12;
const PIPELINE_IN_PATH = /(?:^|\/)pipelines\/([A-Za-z0-9_-]+)\//i;
const PAGE_IN_LABEL = /,\s*p\.?\s*(\d+)\s*$/i;
const MAX_PASSAGE_CHARS = 12000;
const MAX_TITLE_CHARS = 90;

const DOCUMENT_URL = /https:\/\/(?:docs|drive)\.google\.com\/(?:document|spreadsheets|presentation|file)(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)/;
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const SPLIT_CITATION = /\[([^[\]]+?)\][ \t\r\n]+\((pipelines\/[^\s)]+?\.pdf(?:#\d+)?|https:\/\/(?:docs|drive)\.google\.com\/[^\s)]+)\)/g;

/** A model often wraps a long citation so the title and path are not one link. */
export function joinSplitCitationLinks(text: string): string {
  return text.replace(SPLIT_CITATION, (_full, label: string, href: string) => {
    const title = label.replace(/\s+/g, " ").trim();
    return `[${title}](${href})`;
  });
}
const BARE_FILE_ID = /^[A-Za-z0-9_-]{25,}$/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

type ToolCall = {
  name?: string;
  args?: unknown;
  content?: unknown;
};

export function fileIdFromDocumentUrl(href: string): string | null {
  const match = href.match(new RegExp(DOCUMENT_URL.source));
  return match?.[1] ?? null;
}

export type CitationTarget = {
  fileId: string;
  chunkId: string;
  pipeline: string;
  page: number | null;
};

/** A pipeline chunk path such as pipelines/name/stages/crawl/<file id>.pdf#13. */
export function citationTarget(href: string, label = ""): CitationTarget | null {
  const trimmed = href.trim();
  const match = CHUNK_FILE.exec(trimmed);
  if (!match?.[1]) return null;
  const pageMatch = PAGE_IN_LABEL.exec(label.trim());
  const page = pageMatch?.[1] ? Number(pageMatch[1]) : null;
  return {
    fileId: match[1],
    chunkId: trimmed,
    pipeline: PIPELINE_IN_PATH.exec(trimmed)?.[1] ?? "",
    page: page != null && Number.isFinite(page) ? page : null,
  };
}

export type WarmTarget = { pipeline: string; chunkId: string };

function pushWarmTarget(targets: WarmTarget[], seen: Set<string>, pipeline: string, chunkId: string): void {
  if (!pipeline || !chunkId || seen.has(chunkId) || targets.length >= MAX_WARM_PAGES) return;
  seen.add(chunkId);
  targets.push({ pipeline, chunkId });
}

/** Chunk paths already written into the answer, including a partial stream. */
export function citationTargetsInText(text: string): WarmTarget[] {
  const targets: WarmTarget[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(new RegExp(CHUNK_PATH.source, "g"))) {
    pushWarmTarget(targets, seen, match[1] ?? "", match[0] ?? "");
  }
  return targets;
}

/** Cited pages inside a chunk-search result, so images can start before the answer. */
export function citationTargetsInChunkResult(name: string | undefined, content: unknown): WarmTarget[] {
  const text = textOf(content);
  const namedChunkSearch = typeof name === "string" && name.endsWith("get_chunks_for_embeddings");
  if (!namedChunkSearch && !text.includes('"chunk_id"')) return [];
  const headerPipeline = /pipeline "([^"]+)"/.exec(text)?.[1] ?? "";
  const targets: WarmTarget[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(new RegExp(CHUNK_ID_FIELD.source, "g"))) {
    const chunkId = match[1] ?? "";
    const pipeline = /pipelines\/([A-Za-z0-9_-]+)\//.exec(chunkId)?.[1] ?? headerPipeline;
    pushWarmTarget(targets, seen, pipeline, chunkId);
  }
  return targets;
}

/** A document URL, a bare file id, or a pipeline chunk path. */
export function fileIdFromCitationHref(href: string): string | null {
  const fromUrl = fileIdFromDocumentUrl(href);
  if (fromUrl) return fromUrl;
  const fromChunk = citationTarget(href);
  if (fromChunk) return fromChunk.fileId;
  const trimmed = href.trim();
  return BARE_FILE_ID.test(trimmed) ? trimmed : null;
}

/** Relative and same-app links resolve under /chat and open another chat. */
export function isInAppHref(href: string, origin = ""): boolean {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return true;
  if (!HAS_SCHEME.test(trimmed)) return true;
  if (!origin) return false;
  try {
    return new URL(trimmed).origin === origin;
  } catch {
    return true;
  }
}

function isChunkSearch(name: string | undefined): boolean {
  return typeof name === "string" && name.endsWith("get_chunks_for_embeddings");
}

function isProcessedDocument(name: string | undefined): boolean {
  return typeof name === "string" && name.endsWith("get_processed_document");
}

function argumentText(args: unknown, key: string): string {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "";
  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function parseJsonArray(text: string): unknown[] {
  const start = text.indexOf("[");
  if (start < 0) return [];
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
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const value: unknown = JSON.parse(text.slice(start, index + 1));
          return Array.isArray(value) ? value : [];
        } catch {
          return completeObjects(text);
        }
      }
    }
  }
  return completeObjects(text);
}

function completeObjects(text: string): unknown[] {
  const start = text.indexOf("[");
  if (start < 0) return [];
  const objects: unknown[] = [];
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") {
      if (depth === 0) objectStart = index;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        objects.push(parsedValue(text.slice(objectStart, index + 1)));
        objectStart = -1;
      }
    } else if (char === "]" && depth === 0) break;
  }
  return objects.filter((item) => item !== undefined);
}

function parsedValue(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function titleFromText(text: string): string {
  const line = text.split("\n").map((part) => part.trim()).find(Boolean) ?? "Document";
  const plain = line
    .replace(/^#+\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  if (plain.length <= MAX_TITLE_CHARS) return plain;
  return `${plain.slice(0, MAX_TITLE_CHARS - 3)}...`;
}

function pageNumbers(regions: unknown): number[] {
  if (!Array.isArray(regions)) return [];
  const pages = new Set<number>();
  for (const region of regions) {
    if (!region || typeof region !== "object") continue;
    const page = (region as { pageNo?: unknown }).pageNo;
    if (typeof page === "number" && Number.isFinite(page)) pages.add(page);
  }
  return [...pages].sort((left, right) => left - right);
}

function toolCalls(messages: readonly unknown[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const list = (message as { tool_calls?: unknown }).tool_calls;
    if (!Array.isArray(list)) continue;
    for (const call of list) {
      if (call && typeof call === "object") calls.push(call as ToolCall);
    }
  }
  return calls;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => {
    if (typeof block === "string") return block;
    if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
      const text = (block as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    }
    return "";
  }).join("");
}

function answerText(messages: readonly unknown[]): string {
  const parts: string[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    if (String((message as { type?: unknown }).type).toLowerCase() !== "ai") continue;
    parts.push(textOf((message as { content?: unknown }).content));
  }
  return parts.join("\n");
}

function titlesFromAnswer(text: string): Map<string, string> {
  const titles = new Map<string, string>();
  for (const match of joinSplitCitationLinks(text).matchAll(MARKDOWN_LINK)) {
    const fileId = fileIdFromCitationHref(match[2] ?? "");
    const title = match[1]?.trim();
    if (fileId && title && !titles.has(fileId)) titles.set(fileId, title);
  }
  return titles;
}

function rememberProcessedDocuments(
  calls: ToolCall[],
  byFile: Map<string, DocumentReference>,
  titles: Map<string, string>,
): void {
  for (const call of calls) {
    if (!isProcessedDocument(call.name)) continue;
    const fileId = argumentText(call.args, "file_id");
    const pipeline = argumentText(call.args, "pipeline_name");
    if (!fileId) continue;
    const existing = byFile.get(fileId);
    if (existing) {
      if (!existing.pipeline) existing.pipeline = pipeline;
      continue;
    }
    byFile.set(fileId, emptyReference(fileId, titles.get(fileId) ?? "Document", pipeline));
  }
  const pipelines = new Set([...byFile.values()].map((item) => item.pipeline).filter(Boolean));
  if (pipelines.size !== 1) return;
  const pipeline = [...pipelines][0] ?? "";
  for (const [fileId, title] of titles) {
    if (!byFile.has(fileId)) byFile.set(fileId, emptyReference(fileId, title, pipeline));
  }
}

function emptyReference(fileId: string, title: string, pipeline: string): DocumentReference {
  return { fileId, title, pipeline, pages: [], passages: [], images: [] };
}

function rememberPage(reference: DocumentReference, page: number | null): void {
  if (page == null || reference.pages.includes(page)) return;
  reference.pages.push(page);
  reference.pages.sort((left, right) => left - right);
}

function addCitedPassage(reference: DocumentReference, target: CitationTarget): void {
  const found = reference.passages.find((passage) => passage.chunkId === target.chunkId);
  if (found) {
    if (found.page == null && target.page != null) found.page = target.page;
    rememberPage(reference, target.page ?? found.page);
    return;
  }
  if (reference.passages.length >= MAX_PASSAGES) return;
  reference.passages.push({ page: target.page, text: "", chunkId: target.chunkId });
  rememberPage(reference, target.page);
}

function rememberAnswerCitations(text: string, byFile: Map<string, DocumentReference>): void {
  for (const match of joinSplitCitationLinks(text).matchAll(MARKDOWN_LINK)) {
    const label = match[1]?.trim() ?? "";
    const target = citationTarget(match[2] ?? "", label);
    if (!target) continue;
    const existing = byFile.get(target.fileId);
    if (!existing) {
      const created = emptyReference(target.fileId, label || "Document", target.pipeline);
      addCitedPassage(created, target);
      byFile.set(target.fileId, created);
      continue;
    }
    if (!existing.pipeline && target.pipeline) existing.pipeline = target.pipeline;
    if (existing.title === "Document" && label) existing.title = label;
    addCitedPassage(existing, target);
  }
}

export type ViewerPage = {
  fileId: string;
  title: string;
  pipeline: string;
  page: number | null;
  chunkId: string | null;
  text: string;
};

/** Cited pages in reference order. One document can contribute several pages. */
export function viewerPages(references: readonly DocumentReference[]): ViewerPage[] {
  const pages: ViewerPage[] = [];
  for (const reference of references) {
    if (reference.passages.length === 0) {
      pages.push({
        fileId: reference.fileId,
        title: reference.title,
        pipeline: reference.pipeline,
        page: reference.pages[0] ?? null,
        chunkId: null,
        text: "",
      });
      continue;
    }
    for (const passage of reference.passages) {
      pages.push({
        fileId: reference.fileId,
        title: reference.title,
        pipeline: reference.pipeline,
        page: passage.page,
        chunkId: passage.chunkId,
        text: passage.text,
      });
    }
  }
  return pages;
}

export function viewerStartIndex(pages: readonly ViewerPage[], fileId: string, href = ""): number {
  const chunkId = href.trim();
  if (chunkId) {
    const exact = pages.findIndex((page) => page.chunkId === chunkId);
    if (exact >= 0) return exact;
  }
  const first = pages.findIndex((page) => page.fileId === fileId);
  return first >= 0 ? first : 0;
}

/** Documents retrieved in this turn, cited ones first. */
export function documentReferences(messages: readonly unknown[]): DocumentReference[] {
  const titles = titlesFromAnswer(answerText(messages));
  const byFile = new Map<string, DocumentReference>();

  for (const call of toolCalls(messages)) {
    const content = textOf(call.content);
    if (!isChunkSearch(call.name) || !content) continue;
    const pipeline = /pipeline "([^"]+)"/.exec(content)?.[1] ?? "";
    for (const item of parseJsonArray(content)) {
      if (!item || typeof item !== "object") continue;
      const record = item as { file_id?: unknown; chunk_text?: unknown; chunk_id?: unknown; regions?: unknown };
      const fileId = typeof record.file_id === "string" ? record.file_id : "";
      const text = typeof record.chunk_text === "string" ? record.chunk_text.trim() : "";
      if (!fileId || !text) continue;
      const chunkId = typeof record.chunk_id === "string" ? record.chunk_id : null;
      const pages = pageNumbers(record.regions);
      const passage: DocumentPassage = {
        page: pages[0] ?? null,
        text: text.length > MAX_PASSAGE_CHARS ? `${text.slice(0, MAX_PASSAGE_CHARS - 3)}...` : text,
        chunkId,
      };
      const existing = byFile.get(fileId);
      if (!existing) {
        byFile.set(fileId, {
          fileId,
          title: titles.get(fileId) ?? titleFromText(text),
          pipeline,
          pages,
          passages: [passage],
          images: [],
        });
        continue;
      }
      for (const page of pages) {
        if (!existing.pages.includes(page)) existing.pages.push(page);
      }
      existing.pages.sort((left, right) => left - right);
      if (existing.passages.length < MAX_PASSAGES) existing.passages.push(passage);
    }
  }

  rememberProcessedDocuments(toolCalls(messages), byFile, titles);
  rememberAnswerCitations(answerText(messages), byFile);

  const cited = [...titles.keys()].filter((fileId) => byFile.has(fileId));
  const rest = [...byFile.keys()].filter((fileId) => !cited.includes(fileId));
  return [...cited, ...rest].slice(0, MAX_DOCUMENTS).flatMap((fileId) => {
    const reference = byFile.get(fileId);
    return reference ? [reference] : [];
  });
}
