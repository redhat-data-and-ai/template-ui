import { useState, useCallback, useRef, type DragEvent } from 'react';

export function useSidebarDragDrop(
  onAssign: (threadId: string, projectId: string | null) => Promise<boolean>,
) {
  const [draggedThreadId, setDraggedThreadId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const processingRef = useRef(false);

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLElement>, threadId: string) => {
      e.dataTransfer.setData('text/plain', threadId);
      e.dataTransfer.effectAllowed = 'move';
      setDraggedThreadId(threadId);
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLElement>, targetId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverTarget(targetId);
    },
    [],
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setDragOverTarget(null);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLElement>, targetProjectId: string | null) => {
      e.preventDefault();
      const threadId = e.dataTransfer.getData('text/plain');
      setDragOverTarget(null);
      setDraggedThreadId(null);
      if (processingRef.current) return;
      processingRef.current = true;
      try {
        if (threadId) {
          await onAssign(threadId, targetProjectId);
        }
      } finally {
        processingRef.current = false;
      }
    },
    [onAssign],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedThreadId(null);
    setDragOverTarget(null);
  }, []);

  return {
    draggedThreadId,
    dragOverTarget,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  };
}
