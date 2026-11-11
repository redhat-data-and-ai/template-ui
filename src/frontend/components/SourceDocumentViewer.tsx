import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { ChevronLeft, ChevronRight, FileText, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { markdownSanitizeSchema } from "../lib/markdown-sanitize";
import { fileIdFromCitationHref, isInAppHref, viewerPages, viewerStartIndex, type DocumentReference } from "../lib/document-references";
import { loadPageImages, peekPageImage } from "../lib/processed-document";
import { callMcpAppTool } from "../services/mcp-apps-api";
import type { CitationImage } from "../../server/citation-images";

function excerpt(text: string): string {
  const plain = text.replace(/^#+\s*/gm, "").replace(/\s+/g, " ").trim();
  if (plain.length <= 140) return plain;
  return `${plain.slice(0, 137)}...`;
}

function ViewerToolbar({
  title,
  pageLabel,
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  onPrev,
  onNext,
  canPrev,
  canNext,
  showNav,
  onClose,
}: {
  title: string;
  pageLabel: string;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  showNav: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{pageLabel}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {showNav ? (
          <>
            <button type="button" onClick={onPrev} disabled={!canPrev} className="rounded-md p-1.5 hover:bg-muted disabled:opacity-30" aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={onNext} disabled={!canNext} className="rounded-md p-1.5 hover:bg-muted disabled:opacity-30" aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="mx-2 h-5 w-px bg-border" />
          </>
        ) : null}
        <button type="button" onClick={onZoomOut} className="rounded-md p-1.5 hover:bg-muted" aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="w-12 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={onZoomIn} className="rounded-md p-1.5 hover:bg-muted" aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </button>
        <button type="button" onClick={onReset} className="rounded-md p-1.5 hover:bg-muted" aria-label="Reset zoom">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <div className="mx-2 h-5 w-px bg-border" />
        <button type="button" onClick={onClose} className="rounded-md p-1.5 hover:bg-muted" aria-label="Close document">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PageImage({ title, image }: { title: string; image: CitationImage }) {
  return (
    <img
      src={`data:${image.mimeType};base64,${image.data}`}
      alt={`${title} page`}
      className="bg-white shadow-2xl"
      style={{ width: "850px" }}
    />
  );
}

function DocumentPaper({
  title,
  markdown,
  image,
  loading,
  onOpenDocument,
}: {
  title: string;
  markdown: string;
  image: CitationImage | null;
  loading: boolean;
  onOpenDocument?: (fileId: string, href?: string) => void;
}) {
  if (image) return <PageImage title={title} image={image} />;
  if (markdown) {
    return <DocumentArticle markdown={markdown} onOpenDocument={onOpenDocument} />;
  }
  if (loading) {
    return <p className="mt-20 text-sm text-neutral-200">Loading the page...</p>;
  }
  return <p className="mt-20 text-sm text-muted-foreground">This document was not in the retrieved passages.</p>;
}

function DocumentArticle({
  markdown,
  onOpenDocument,
}: {
  markdown: string;
  onOpenDocument?: (fileId: string, href?: string) => void;
}) {
  return (
    <article
      className="prose prose-neutral max-w-none bg-white px-10 py-8 text-neutral-900 shadow-2xl"
      style={{ width: "850px" }}
    >
      {markdown ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema]]}
          components={{
            a: ({ href, children }) => {
              const link = typeof href === "string" ? href : "";
              const fileId = fileIdFromCitationHref(link);
              if (fileId && onOpenDocument) {
                return (
                  <button type="button" className="citation-link" onClick={() => onOpenDocument(fileId, link)}>
                    {children}
                  </button>
                );
              }
              if (fileId || isInAppHref(link, globalThis.location?.origin ?? "")) {
                return <span>{children}</span>;
              }
              return <a href={link} target="_blank" rel="noopener noreferrer">{children}</a>;
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
      ) : null}
    </article>
  );
}

function pageCaption(page: number | null, index: number, count: number): string {
  const where = count > 1 ? `${index + 1} of ${count}` : "";
  const label = page != null ? `Page ${page}` : "Document";
  return [label, where].filter(Boolean).join(" · ");
}

export function SourceDocumentViewer({
  fileId,
  href = "",
  references,
  onClose,
  onActiveFile,
  onOpenDocument,
}: {
  fileId: string;
  href?: string;
  references: readonly DocumentReference[];
  onClose: () => void;
  onActiveFile?: (fileId: string) => void;
  onOpenDocument?: (fileId: string, href?: string) => void;
}) {
  const pages = useMemo(() => viewerPages(references), [references]);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const [index, setIndex] = useState(() => viewerStartIndex(pages, fileId, href));
  const [zoom, setZoom] = useState(1);
  const [readyTick, setReadyTick] = useState(0);
  const current = pages[index] ?? pages[0];
  const title = current?.title ?? "Document";
  const markdown = current?.text ?? "";
  const storedImage = current?.pipeline && current.chunkId
    ? peekPageImage(current.pipeline, current.chunkId)
    : null;
  const image = storedImage ?? null;
  const waitingForImage = Boolean(current?.pipeline && current.chunkId && storedImage === undefined && readyTick >= 0);

  useEffect(() => {
    setIndex(viewerStartIndex(pagesRef.current, fileId, href));
  }, [fileId, href]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex((value) => Math.min(value + 1, Math.max(pagesRef.current.length - 1, 0)));
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(value - 1, 0));
      if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(value + 0.25, 3));
      if (event.key === "-") setZoom((value) => Math.max(value - 0.25, 0.5));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const page = pages[index];
    if (!page) return;
    onActiveFile?.(page.fileId);
    if (!page.pipeline || !page.chunkId) return;
    if (peekPageImage(page.pipeline, page.chunkId) !== undefined) return;
    let active = true;
    loadPageImages(page.pipeline, page.chunkId, [], callMcpAppTool).finally(() => {
      if (active) setReadyTick((value) => value + 1);
    });
    return () => {
      active = false;
    };
  }, [index, pages, onActiveFile]);

  const cited = current?.text ? excerpt(current.text) : "";
  const pageLabel = pageCaption(current?.page ?? null, index, pages.length);

  return createPortal(
    <div className="fixed inset-0 z-[500] flex flex-col bg-background/95 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <ViewerToolbar
        title={title}
        pageLabel={pageLabel}
        zoom={zoom}
        onZoomIn={() => setZoom((value) => Math.min(value + 0.25, 3))}
        onZoomOut={() => setZoom((value) => Math.max(value - 0.25, 0.5))}
        onReset={() => setZoom(1)}
        onPrev={() => setIndex((value) => Math.max(value - 1, 0))}
        onNext={() => setIndex((value) => Math.min(value + 1, Math.max(pages.length - 1, 0)))}
        canPrev={index > 0}
        canNext={index < pages.length - 1}
        showNav={pages.length > 1}
        onClose={onClose}
      />
      <div className="flex flex-1 justify-center overflow-auto bg-neutral-900/50 p-6">
        <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
          <DocumentPaper title={title} markdown={markdown} image={image} loading={waitingForImage && markdown.length === 0} onOpenDocument={onOpenDocument} />
        </div>
      </div>
      {cited ? (
        <div className="flex items-center gap-3 border-t border-border bg-yellow-500/5 px-4 py-2">
          <div className="h-3 w-3 rounded-sm border border-yellow-400 bg-yellow-400/30" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Cited passage</span>
            {": "}
            {cited}
          </p>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
