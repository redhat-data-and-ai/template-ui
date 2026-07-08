import { useEffect, useRef, useState } from 'react';
import { Button } from '@patternfly/react-core';
import { Plus, Trash2, Brain, AlertCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { addMemory, removeMemory, clearMemories, selectMemories } from '../../redux/slices/personalization';
import { createMemory, deleteMemory, deleteAllMemories, listMemories } from '../../services/agent-rest';

export function MemoryList() {
  const dispatch = useAppDispatch();
  const memories = useAppSelector(selectMemories);
  const [draft, setDraft] = useState('');
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;

    listMemories().then((backendMems) => {
      if (backendMems.length === 0) return;
      dispatch(clearMemories());
      for (const bm of backendMems) {
        dispatch(addMemory(bm.content));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = () => {
    const text = draft.trim();
    if (!text) return;
    const alreadyExists = memories.some((m) => m.content === text);
    if (!alreadyExists) {
      dispatch(addMemory(text));
    }
    createMemory(text).catch(() => {});
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-400/80">
          Memories are facts the agent remembers across conversations. Add things like
          your preferences, context, or recurring instructions.
        </p>
      </div>

      <div className="flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. I prefer metric units for all measurements"
          aria-label="New memory"
          className="flex-1 rounded-xl px-3.5 py-2.5 text-sm resize-none min-h-[40px] border-0 bg-secondary/50 placeholder:opacity-60 focus:bg-card focus:outline-none focus:ring-0 focus:border-transparent focus:shadow-none"
          style={{ border: '1px solid var(--border)', boxShadow: 'none' }}
          rows={2}
        />
        <Button
          variant="primary"
          size="sm"
          isDisabled={!draft.trim()}
          onClick={handleAdd}
          className="self-end"
          icon={<Plus className="w-4 h-4" />}
        >
          Add
        </Button>
      </div>

      {memories.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Brain className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground/60">No memories yet</p>
          <p className="text-xs text-muted-foreground/40 mt-1">
            Add facts for the agent to remember
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {memories.map((mem) => (
              <li
                key={mem.id}
                className="group flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-secondary/30 transition-colors"
              >
                <Brain className="w-4 h-4 text-primary/60 mt-0.5 shrink-0" />
                <p className="flex-1 text-sm text-foreground leading-relaxed">{mem.content}</p>
                <button
                  onClick={() => { dispatch(removeMemory(mem.id)); deleteMemory(mem.id).catch(() => {}); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  aria-label="Remove memory"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {memories.length > 1 && (
            <div className="flex justify-end">
              <Button
                variant="plain"
                isDanger
                size="sm"
                onClick={() => { dispatch(clearMemories()); deleteAllMemories().catch(() => {}); }}
              >
                Clear all memories
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
