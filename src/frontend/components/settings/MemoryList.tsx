import { useEffect } from 'react';
import { Button, Spinner, Switch } from '@patternfly/react-core';
import { Trash2, Brain, AlertCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  fetchMemories,
  fetchPreferences,
  updateMemoryEnabled,
  deleteMemory,
  deleteAllMemories,
  selectMemories,
  selectMemoriesLoading,
  selectMemoryEnabled,
  selectPreferencesLoading,
  selectPersonalizationError,
} from '../../redux/slices/personalization';

export function MemoryList() {
  const dispatch = useAppDispatch();
  const memories = useAppSelector(selectMemories);
  const memoriesLoading = useAppSelector(selectMemoriesLoading);
  const memoryEnabled = useAppSelector(selectMemoryEnabled);
  const preferencesLoading = useAppSelector(selectPreferencesLoading);
  const error = useAppSelector(selectPersonalizationError);

  useEffect(() => {
    dispatch(fetchPreferences());
  }, [dispatch]);

  useEffect(() => {
    if (memoryEnabled) {
      dispatch(fetchMemories());
    }
  }, [dispatch, memoryEnabled]);

  return (
    <div className="space-y-6">
      {/* Memory enable/disable toggle */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold">Memory</h3>
              {memoryEnabled && (
                <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {memoryEnabled
                ? 'The agent remembers facts about you across conversations'
                : 'Memory is disabled — the agent will not save or recall information about you'}
            </p>
          </div>
          <Switch
            id="memory-enabled-switch"
            aria-label="Toggle memory"
            isChecked={memoryEnabled}
            isDisabled={preferencesLoading}
            onChange={(_, checked) => dispatch(updateMemoryEnabled(checked))}
          />
        </div>
      </div>

      {!memoryEnabled ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Brain className="w-8 h-8 text-muted-foreground/30 mb-2" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Memory is turned off</p>
          <p className="text-xs text-muted-foreground mt-1">
            Enable the toggle above to let the agent remember information about you
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
            <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              These are memories the agent has created about you across conversations.
              You can delete them at any time.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {memoriesLoading ? (
            <div className="flex flex-col items-center py-8">
              <Spinner size="md" aria-label="Loading memories" />
              <p className="text-sm text-muted-foreground mt-2">Loading...</p>
            </div>
          ) : memories.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Brain className="w-8 h-8 text-muted-foreground/30 mb-2" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No memories yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                The agent will learn about you as you interact with it
              </p>
            </div>
          ) : (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary/70" aria-hidden="true" />
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
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                      aria-label="Delete memory"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
