import { useState, type RefObject } from "react";
import type { SubagentOption } from "./slash-subagents";

const DESCRIPTION_WIDTH = 256;

function descriptionOrigin(row: DOMRect): { top: number; left: number } {
  const fitsOnRight = window.innerWidth - row.right >= DESCRIPTION_WIDTH;
  const left = fitsOnRight ? row.right : Math.max(8, row.left - DESCRIPTION_WIDTH);
  const top = Math.max(8, Math.min(row.top, window.innerHeight - 16));
  return { top, left };
}

interface SlashSubagentMenuProps {
  isOpen: boolean;
  status: "idle" | "loading" | "ready" | "error";
  matches: SubagentOption[];
  highlight: number;
  listId: string;
  rootRef: RefObject<HTMLDivElement | null>;
  onSelect: (index: number) => void;
  onHighlight: (index: number) => void;
}

export function SlashSubagentMenu({
  isOpen,
  status,
  matches,
  highlight,
  listId,
  rootRef,
  onSelect,
  onHighlight,
}: SlashSubagentMenuProps) {
  const [hovered, setHovered] = useState<{ index: number; top: number; left: number } | null>(null);

  if (!isOpen) return null;

  let statusText: string | null = null;
  if (status === "loading") statusText = "Loading subagents";
  else if (status === "error") statusText = "Couldn't load subagents";
  else if (matches.length === 0) statusText = "No subagents";

  const hoveredItem = hovered == null ? null : matches[hovered.index];

  return (
    <div
      ref={rootRef}
      className="absolute bottom-full left-0 right-0 z-20 mb-2"
      onMouseLeave={() => setHovered(null)}
    >
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-elevated">
        <div
          id={listId}
          role="listbox"
          aria-label="Subagents"
          className="max-h-60 overflow-y-auto p-1"
        >
          {statusText ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">{statusText}</p>
          ) : (
            matches.map((item, index) => {
              const selected = index === highlight;
              return (
                <button
                  key={item.name}
                  id={`${listId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-describedby={hovered?.index === index ? `${listId}-description` : undefined}
                  className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left ${
                    selected ? "bg-secondary" : "hover:bg-secondary/60"
                  }`}
                  onMouseEnter={(event) => {
                    const origin = descriptionOrigin(event.currentTarget.getBoundingClientRect());
                    setHovered({ index, ...origin });
                    onHighlight(index);
                  }}
                  onClick={() => onSelect(index)}
                >
                  <span className="text-sm font-medium text-foreground">/{item.name}</span>
                  {item.description ? (
                    <span className="w-full truncate text-xs text-muted-foreground">{item.description}</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
      {hoveredItem?.description && hovered ? (
        <div
          id={`${listId}-description`}
          role="region"
          aria-label="Subagent description"
          className="z-30 max-h-60 overflow-y-auto whitespace-normal rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground shadow-elevated"
          style={{ position: "fixed", top: hovered.top, left: hovered.left, width: DESCRIPTION_WIDTH }}
        >
          {hoveredItem.description}
        </div>
      ) : null}
    </div>
  );
}
