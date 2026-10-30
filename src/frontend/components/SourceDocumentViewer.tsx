import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileText,
  ChevronLeft,
  ChevronRight,
  Maximize2,
} from 'lucide-react';
import type { ReferenceChunk } from '../redux/slices/references';

interface SourceDocumentViewerProps {
  chunk: ReferenceChunk;
  onClose: () => void;
}

function pageImageUrl(rawDocTitle: string, page: number): string {
  const padded = String(page).padStart(3, '0');
  const filename = `${rawDocTitle}_page_${padded}_input.png`;
  return `/api/pages/${encodeURIComponent(rawDocTitle)}/${encodeURIComponent(filename)}`;
}

export function SourceDocumentViewer({ chunk, onClose }: SourceDocumentViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(chunk.page);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const isHighlightPage = currentPage === chunk.page;

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleReset = () => setZoom(1);

  const handlePrevPage = useCallback(() => {
    setCurrentPage((p) => {
      if (p <= 1) return p;
      setImageLoaded(false);
      setImageError(false);
      return p - 1;
    });
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => {
      setImageLoaded(false);
      setImageError(false);
      return p + 1;
    });
  }, []);

  const handleGoToChunkPage = () => {
    setCurrentPage(chunk.page);
    setImageLoaded(false);
    setImageError(false);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === '+' || e.key === '=') handleZoomIn();
    if (e.key === '-') handleZoomOut();
    if (e.key === 'ArrowLeft') handlePrevPage();
    if (e.key === 'ArrowRight') handleNextPage();
  }, [onClose, handlePrevPage, handleNextPage]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const imgSrc = pageImageUrl(chunk.raw_doc_title, currentPage);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shadow-sm">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {chunk.doc_title}
            </h2>
            <p className="text-xs text-muted-foreground">
              Page {currentPage}
              {isHighlightPage && chunk.bbox && (
                <span className="ml-2 text-primary font-medium">
                  - Showing highlighted reference
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Page navigation */}
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-muted-foreground px-2 min-w-[60px] text-center">
            Page {currentPage}
          </span>
          <button
            type="button"
            onClick={handleNextPage}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-border mx-2" />

          {/* Zoom controls */}
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-muted-foreground w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Reset zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {!isHighlightPage && (
            <>
              <div className="w-px h-5 bg-border mx-2" />
              <button
                type="button"
                onClick={handleGoToChunkPage}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
              >
                <Maximize2 className="w-3 h-3" />
                Go to reference (p{chunk.page})
              </button>
            </>
          )}

          <div className="w-px h-5 bg-border mx-2" />

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Close viewer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Document viewer area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex items-start justify-center p-6 bg-neutral-900/50"
      >
        {imageError ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground mt-20">
            <FileText className="w-12 h-12 opacity-40" />
            <p className="text-sm">Page image not available</p>
            <button
              type="button"
              onClick={handleGoToChunkPage}
              className="text-xs text-primary hover:underline"
            >
              Return to page {chunk.page}
            </button>
          </div>
        ) : (
          <div
            className="relative shadow-2xl rounded-sm"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.2s ease' }}
          >
            <img
              ref={imgRef}
              src={imgSrc}
              alt={`${chunk.doc_title} - Page ${currentPage}`}
              className="max-w-none bg-white"
              style={{ width: '850px' }}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />

            {/* Bounding box highlight overlay */}
            {isHighlightPage && chunk.bbox && imageLoaded && (
              <div
                className="absolute border-2 border-yellow-400 bg-yellow-400/15 rounded-sm pointer-events-none"
                style={{
                  left: `${chunk.bbox[0] * 100}%`,
                  top: `${chunk.bbox[1] * 100}%`,
                  width: `${(chunk.bbox[2] - chunk.bbox[0]) * 100}%`,
                  height: `${(chunk.bbox[3] - chunk.bbox[1]) * 100}%`,
                  boxShadow: '0 0 0 3px rgba(250, 204, 21, 0.3), 0 0 20px rgba(250, 204, 21, 0.2)',
                  animation: 'pulse-highlight 2s ease-in-out infinite',
                }}
              />
            )}

            {!imageLoaded && !imageError && (
              <div className="absolute inset-0 flex items-center justify-center bg-card/80">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Loading page...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom info bar */}
      {isHighlightPage && chunk.bbox && (
        <div className="px-4 py-2 border-t border-border bg-yellow-500/5 flex items-center gap-3">
          <div className="w-3 h-3 rounded-sm bg-yellow-400/30 border border-yellow-400" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Highlighted region</span>
            {' - '}
            {chunk.text.length > 100 ? chunk.text.slice(0, 100) + '...' : chunk.text}
          </p>
        </div>
      )}
    </div>
  );
}
