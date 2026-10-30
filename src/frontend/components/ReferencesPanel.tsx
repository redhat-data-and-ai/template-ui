import { useState, useCallback, useEffect } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Hash,
  X,
  Eye,
  Star,
  Layers,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { SourceDocumentViewer } from './SourceDocumentViewer';
import { cn } from '../lib/utils';
import { useAppSelector, useAppDispatch } from '../redux/hooks';
import {
  selectQueryGroups,
  selectActiveQueryIndex,
  selectActiveGroup,
  selectAllChunks,
  selectSelectedChunk,
  selectPanelOpen,
  selectDetailOpen,
  setActiveQuery,
  selectChunk,
  closeDetail,
  togglePanel,
} from '../redux/slices/references';
import type { ReferenceChunk } from '../redux/slices/references';

function cropPathToUrl(cropPath: string): string {
  const CROPS_PREFIX = '/data/crops/';
  const idx = cropPath.indexOf(CROPS_PREFIX);
  if (idx >= 0) {
    const relative = cropPath.slice(idx + CROPS_PREFIX.length);
    return `/api/crops/${encodeURI(relative)}`;
  }
  return `/api/crops/${encodeURIComponent(cropPath)}`;
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80
      ? 'text-green-400 bg-green-500/10 border-green-500/20'
      : pct >= 60
        ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
        : 'text-orange-400 bg-orange-500/10 border-orange-500/20';
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border', color)}>
      <Star className="w-2.5 h-2.5" />
      {pct}%
    </span>
  );
}

function ChunkCard({ chunk, index, isSelected, onClick }: {
  chunk: ReferenceChunk;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const preview = chunk.text.length > 120 ? chunk.text.slice(0, 120) + '...' : chunk.text;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border p-3 transition-all duration-200',
        'hover:border-primary/40 hover:bg-muted/50',
        isSelected
          ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/20'
          : 'border-border bg-card',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="flex-shrink-0 w-5 h-5 rounded bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-foreground truncate">{chunk.doc_title}</span>
        </div>
        <ScoreBadge score={chunk.score} />
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <FileText className="w-2.5 h-2.5" /> Page {chunk.page}
        </span>
        {chunk.section && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground truncate">
            <Hash className="w-2.5 h-2.5" /> {chunk.section}
          </span>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-3">{preview}</p>
    </button>
  );
}

function ChunkDetailPopup({ chunk, onClose }: { chunk: ReferenceChunk; onClose: () => void }) {
  const [showFullText, setShowFullText] = useState(false);
  const [showSourceViewer, setShowSourceViewer] = useState(false);

  const displayText = showFullText
    ? chunk.text
    : chunk.text.length > 500 ? chunk.text.slice(0, 500) + '...' : chunk.text;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (showSourceViewer) {
        setShowSourceViewer(false);
      } else {
        onClose();
      }
    }
  }, [onClose, showSourceViewer]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (showSourceViewer) {
    return <SourceDocumentViewer chunk={chunk} onClose={() => setShowSourceViewer(false)} />;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-background border border-border rounded-2xl shadow-2xl w-[90vw] max-w-[700px] max-h-[85vh] flex flex-col overflow-hidden animate-fadeInUpSmooth"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card/80">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground truncate">{chunk.doc_title}</h3>
            <div className="flex items-center gap-3 mt-1">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <FileText className="w-3 h-3" /> Page {chunk.page}
              </span>
              <ScoreBadge score={chunk.score} />
              {chunk.section && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Hash className="w-3 h-3" /> {chunk.section}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 p-2 rounded-lg hover:bg-muted transition-colors ml-3"
            aria-label="Close (Esc)"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Query context */}
          {chunk.search_query && (
            <div className="px-5 py-2 bg-primary/5 border-b border-border">
              <p className="text-xs text-primary">
                <span className="font-medium">Query:</span> &ldquo;{chunk.search_query}&rdquo;
              </p>
            </div>
          )}

          {/* Extracted content */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Extracted Content</h4>
              {chunk.text.length > 500 && (
                <button type="button" onClick={() => setShowFullText(!showFullText)} className="text-[10px] text-primary hover:underline">
                  {showFullText ? 'Show less' : 'Show all'}
                </button>
              )}
            </div>
            <div className="text-sm leading-relaxed text-foreground bg-muted/40 border border-border rounded-lg p-4 whitespace-pre-wrap">
              {displayText}
            </div>
          </div>

          {/* Visual citation */}
          {chunk.crop_path && (
            <div className="px-5 pb-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Visual Citation</h4>
              <div className="rounded-lg border border-border overflow-hidden bg-white">
                <img
                  src={cropPathToUrl(chunk.crop_path)}
                  alt={`Visual citation from ${chunk.doc_title} page ${chunk.page}`}
                  className="w-full h-auto"
                  onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                />
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="px-5 pb-4">
            <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
              <span className="bg-muted px-2 py-1 rounded font-mono">ID: {chunk.chunk_id}</span>
              {chunk.doc_id && <span className="bg-muted px-2 py-1 rounded font-mono">Doc: {chunk.doc_id}</span>}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-border bg-card/50 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowSourceViewer(true)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Eye className="w-4 h-4" />
            View Source Document
            {chunk.bbox && <span className="text-xs opacity-70">(highlighted)</span>}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Close
          </button>
        </div>

        {/* Esc hint */}
        <div className="absolute top-3.5 right-14 text-[9px] text-muted-foreground/50 font-mono">
          ESC
        </div>
      </div>
    </div>
  );
}

export function ReferencesPanel() {
  const dispatch = useAppDispatch();
  const queryGroups = useAppSelector(selectQueryGroups);
  const activeIdx = useAppSelector(selectActiveQueryIndex);
  const activeGroup = useAppSelector(selectActiveGroup);
  const allChunks = useAppSelector(selectAllChunks);
  const selectedChunk = useAppSelector(selectSelectedChunk);
  const panelOpen = useAppSelector(selectPanelOpen);
  const detailOpen = useAppSelector(selectDetailOpen);
  const [expanded, setExpanded] = useState(false);

  if (allChunks.length === 0) return null;

  if (!panelOpen) {
    return (
      <div className="relative flex-shrink-0 w-10 border-l border-border bg-card/50 h-full flex flex-col items-center justify-center">
        <button
          type="button"
          onClick={() => dispatch(togglePanel())}
          className="flex flex-col items-center gap-2 px-1 py-4 rounded-md hover:bg-muted transition-colors"
          aria-label="Show references"
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          <BookOpen className="w-5 h-5 text-primary" />
          <span className="text-xs font-bold text-primary">{allChunks.length}</span>
        </button>
      </div>
    );
  }

  const panelWidth = expanded ? 'w-[520px]' : 'w-[300px]';

  return (
    <>
      <div className={cn('flex flex-col flex-shrink-0 border-l border-border bg-background transition-all duration-300 h-full animate-slideInRight', panelWidth)}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-card/80">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">References</span>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{allChunks.length}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded-md hover:bg-muted transition-colors"
              aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <Minimize2 className="w-3.5 h-3.5 text-muted-foreground" /> : <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
            <button
              type="button"
              onClick={() => dispatch(togglePanel())}
              className="p-1 rounded-md hover:bg-muted transition-colors"
              aria-label="Close references panel"
            >
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Query selector - stacked rows */}
        {queryGroups.length > 1 && (
          <div className="flex flex-col border-b border-border bg-card/50 overflow-y-auto max-h-40">
            {queryGroups.map((group, idx) => (
              <button
                key={group.query}
                type="button"
                onClick={() => dispatch(setActiveQuery(idx))}
                className={cn(
                  'w-full text-left px-3 py-2 text-xs transition-colors border-l-2 flex items-center justify-between gap-2',
                  idx === activeIdx
                    ? 'border-l-primary text-primary font-medium bg-primary/5'
                    : 'border-l-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  idx < queryGroups.length - 1 && 'border-b border-border/50',
                )}
                title={group.query}
              >
                <span className="truncate flex-1">{group.query}</span>
                <span className={cn(
                  'flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                  idx === activeIdx ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}>
                  {group.chunks.length}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Single query label */}
        {queryGroups.length === 1 && activeGroup && (
          <div className="px-3 py-1.5 border-b border-border bg-primary/5">
            <p className="text-[11px] text-primary font-medium truncate" title={activeGroup.query}>
              &ldquo;{activeGroup.query}&rdquo;
            </p>
          </div>
        )}

        {/* Chunk list */}
        <div className={cn('flex-1 overflow-y-auto p-2', expanded ? 'grid grid-cols-2 gap-2 items-start content-start' : 'space-y-2')}>
          {activeGroup?.chunks.map((chunk, index) => (
            <ChunkCard
              key={chunk.chunk_id}
              chunk={chunk}
              isSelected={selectedChunk?.chunk_id === chunk.chunk_id}
              index={index}
              onClick={() => dispatch(selectChunk(chunk.chunk_id))}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-border bg-card/50">
          <p className="text-[10px] text-muted-foreground text-center">
            {queryGroups.length > 1
              ? `${queryGroups.length} queries - select one to view results`
              : 'Click a reference to view details'}
          </p>
        </div>
      </div>

      {/* Chunk detail as popup overlay */}
      {detailOpen && selectedChunk && (
        <ChunkDetailPopup chunk={selectedChunk} onClose={() => dispatch(closeDetail())} />
      )}
    </>
  );
}
