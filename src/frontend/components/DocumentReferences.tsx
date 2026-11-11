import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, ChevronRight, FileText } from "lucide-react";
import { documentReferences, viewerPages, type DocumentReference } from "../lib/document-references";
import { prefetchCitedPages } from "../lib/processed-document";
import { callMcpAppTool } from "../services/mcp-apps-api";
import { DocumentOpenContext } from "./document-open-context";
import { SourceDocumentViewer } from "./SourceDocumentViewer";

function pageLabel(pages: number[]): string {
  if (pages.length === 0) return "";
  return `p. ${pages.join(", ")}`;
}

export function ReferencesRail({
  references,
  activeFileId,
  onOpen,
}: {
  references: DocumentReference[];
  activeFileId: string | null;
  onOpen: (fileId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  if (references.length === 0) return null;
  if (!expanded) {
    return (
      <button
        type="button"
        aria-label="References"
        onClick={() => setExpanded(true)}
        className="flex h-full w-11 shrink-0 flex-col items-center justify-center gap-3 border-l border-border bg-card"
      >
        <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="text-xs font-semibold tracking-wide text-foreground" style={{ writingMode: "vertical-rl" }}>
          References
        </span>
        <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">{references.length}</span>
      </button>
    );
  }
  return (
    <aside aria-label="References" className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">References</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{references.length}</span>
        </div>
        <button type="button" onClick={() => setExpanded(false)} aria-label="Hide references" className="rounded-md p-1 hover:bg-muted">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-auto p-2">
        {references.map((reference) => (
          <button
            key={reference.fileId}
            type="button"
            onClick={() => onOpen(reference.fileId)}
            className={`w-full rounded-lg border px-3 py-2 text-left hover:bg-muted/40 ${reference.fileId === activeFileId ? "border-primary bg-primary/5" : "border-border bg-card"}`}
          >
            <span className="flex items-start gap-2">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{reference.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {[reference.pipeline, pageLabel(reference.pages)].filter(Boolean).join(", ")}
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export function DocumentChrome({
  messages,
  children,
}: {
  messages: readonly unknown[];
  children: ReactNode;
}) {
  const references = useMemo(() => documentReferences(messages), [messages]);
  const pages = useMemo(() => viewerPages(references), [references]);
  useEffect(() => {
    prefetchCitedPages(pages, callMcpAppTool);
  }, [pages]);
  const [openDoc, setOpenDoc] = useState<{ fileId: string; href?: string } | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const openDocument = useCallback((fileId: string, href?: string) => {
    setOpenDoc({ fileId, href });
    setActiveFileId(fileId);
  }, []);
  const showFile = useCallback((fileId: string) => setActiveFileId(fileId), []);
  return (
    <DocumentOpenContext.Provider value={openDocument}>
      <div className="flex h-full min-h-0 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        <ReferencesRail references={references} activeFileId={activeFileId} onOpen={openDocument} />
      </div>
      {openDoc ? (
        <SourceDocumentViewer
          fileId={openDoc.fileId}
          href={openDoc.href}
          references={references}
          onClose={() => {
            setOpenDoc(null);
            setActiveFileId(null);
          }}
          onActiveFile={showFile}
          onOpenDocument={openDocument}
        />
      ) : null}
    </DocumentOpenContext.Provider>
  );
}
