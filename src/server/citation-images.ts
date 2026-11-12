/** A page crop returned by get_citation_image. */
export type CitationImage = {
  mimeType: string;
  data: string;
};

const MAX_IMAGES = 4;
const MAX_DATA_CHARS = 1_500_000;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function imageBlock(block: unknown): CitationImage | null {
  if (!block || typeof block !== "object") return null;
  const record = block as Record<string, unknown>;
  if (record.type !== "image") return null;
  const data = typeof record.base64 === "string" ? record.base64 : typeof record.data === "string" ? record.data : "";
  if (!data || data.startsWith("http") || data.length > MAX_DATA_CHARS) return null;
  const mime = typeof record.mime_type === "string" ? record.mime_type : typeof record.mimeType === "string" ? record.mimeType : "image/png";
  if (!ALLOWED_MIME.has(mime)) return null;
  return { mimeType: mime, data };
}

/** Pull page crops out of a tool message. Text blocks are left for the caller. */
export function citationImagesFromContent(content: unknown): CitationImage[] {
  if (!Array.isArray(content)) return [];
  const images: CitationImage[] = [];
  for (const block of content) {
    const image = imageBlock(block);
    if (!image) continue;
    images.push(image);
    if (images.length >= MAX_IMAGES) break;
  }
  return images;
}
