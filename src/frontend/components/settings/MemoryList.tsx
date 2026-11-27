import { useEffect } from 'react';
import { Button, Spinner } from '@patternfly/react-core';
import { Trash2, Brain, AlertCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  fetchMemories,
  deleteMemory,
  deleteAllMemories,
  selectMemories,
  selectMemoriesLoading,
  selectPersonalizationError,
} from '../../redux/slices/personalization';

export function MemoryList() {
  const dispatch = useAppDispatch();
  const memories = useAppSelector(selectMemories);
  const memoriesLoading = useAppSelector(selectMemoriesLoading);
  const error = useAppSelector(selectPersonalizationError);

  useEffect(() => {
    dispatch(fetchMemories());
  }, [dispatch]);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-600 dark:text-blue-300">
          These are memories the agent has created about you across conversations.
          You can delete them at any time.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-400/80">{error}</p>
        </div>
      )}

      {memoriesLoading ? (
        <div className="flex flex-col items-center py-8">
          <Spinner size="md" />
          <p className="text-sm text-muted-foreground mt-2">Loading...</p>
        </div>
      ) : memories.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Brain className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No memories yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            The agent will learn about you as you interact with it
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary/70" />
              <h3 className="text-sm font-semibold text-foreground">
                Memories
              </h3>
              <span className="text-xs text-muted-foreground">
                ({memories.length})
              </span>
            </div>
            <Button
              variant="link"
              isDanger
              size="sm"
              className="!text-xs !p-0"
              onClick={() => dispatch(deleteAllMemories())}
            >
              Delete All
            </Button>
          </div>
          <ul className="space-y-2">
            {memories.map((memory) => (
              <li
                key={memory.id}
                className="group flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-secondary/30 transition-colors"
              >
                <p className="flex-1 text-sm text-foreground leading-relaxed">
                  {memory.content}
                </p>
                <button
                  onClick={() => dispatch(deleteMemory(memory.id))}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                  aria-label="Delete memory"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
