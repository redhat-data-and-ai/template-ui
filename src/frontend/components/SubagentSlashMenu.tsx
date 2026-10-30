import type { SubagentOption } from "./subagentSlash";

export type SubagentSlashMenuStatus = "loading" | "error" | "empty" | "ready";

interface SubagentSlashMenuProps {
  options: readonly SubagentOption[];
  highlightedIndex: number;
  status: SubagentSlashMenuStatus;
  listId: string;
  onHighlight: (index: number) => void;
  onSelect: (name: string) => void;
}

export function SubagentSlashMenu({
  options,
  highlightedIndex,
  status,
  listId,
  onHighlight,
  onSelect,
}: SubagentSlashMenuProps) {
  return (
    <div
      id={listId}
      role="listbox"
      aria-label="Subagents"
      className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-elevated"
    >
      {status === "loading" ? (
        <p className="px-3 py-2 text-sm text-muted-foreground" role="status">
          Loading subagents…
        </p>
      ) : null}
      {status === "error" ? (
        <p className="px-3 py-2 text-sm text-destructive" role="alert">
          Could not load subagents
        </p>
      ) : null}
      {status === "empty" ? (
        <p className="px-3 py-2 text-sm text-muted-foreground" role="status">
          No subagents configured
        </p>
      ) : null}
      {status === "ready"
        ? options.map((option, index) => {
            const optionId = `${listId}-option-${index}`;
            const selected = index === highlightedIndex;
            return (
              <button
                key={option.name}
                type="button"
                id={optionId}
                role="option"
                aria-selected={selected}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors ${
                  selected ? "bg-muted" : "hover:bg-muted/60"
                }`}
                onMouseEnter={() => onHighlight(index)}
                onMouseDown={(e) => {
                  // Keep textarea focus; click still selects.
                  e.preventDefault();
                  onSelect(option.name);
                }}
              >
                <span className="text-sm font-medium text-foreground">
                  /{option.name}
                </span>
                {option.description ? (
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </button>
            );
          })
        : null}
      {status === "ready" && options.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted-foreground" role="status">
          No matching subagents
        </p>
      ) : null}
    </div>
  );
}
