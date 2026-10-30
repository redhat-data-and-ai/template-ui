import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type Ref,
} from "react";
import { ArrowUp, StopCircle } from "lucide-react";
import { Alert } from "@patternfly/react-core";
import { SubagentSlashMenu, type SubagentSlashMenuStatus } from "./SubagentSlashMenu";
import {
  applySubagentName,
  fetchMentionCatalog,
  filterSubagents,
  slashHighlightParts,
  slashTokenAtCaret,
  type SubagentOption,
} from "./subagentSlash";

interface InputFormProps {
  onSubmit: (inputValue: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  isRateLimited?: boolean;
  rateLimitRemainingSeconds?: number;
  placeholder?: string;
  inputLabel?: string;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
  } else {
    (ref as MutableRefObject<T | null>).current = value;
  }
}

async function loadSubagentOptions(): Promise<SubagentOption[]> {
  return await fetchMentionCatalog();
}

/** Keeps a caret on a trailing line. Stripped whenever the box is read back. */
const CARET_ANCHOR = "\u200b";

function visibleTextLength(node: Text): number {
  return (node.textContent ?? "").replace(/\u200b/g, "").length;
}

function nodeLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return visibleTextLength(node as Text);
  if (node.nodeName === "BR") return 1;
  let total = 0;
  for (let i = 0; i < node.childNodes.length; i++) total += nodeLength(node.childNodes[i]);
  return total;
}

function offsetOfPoint(root: HTMLElement, container: Node, nodeOffset: number): number {
  if (container === root) {
    let count = 0;
    for (let i = 0; i < nodeOffset && i < root.childNodes.length; i++) {
      count += nodeLength(root.childNodes[i]);
    }
    return count;
  }
  const parent = container.parentNode;
  if (!parent) return 0;
  const index = Array.prototype.indexOf.call(parent.childNodes, container);
  if (container.nodeType === Node.TEXT_NODE) {
    if ((container.textContent ?? "") === CARET_ANCHOR) return offsetOfPoint(root, parent, index);
    return offsetOfPoint(root, parent, index) + nodeOffset;
  }
  let within = 0;
  for (let i = 0; i < nodeOffset && i < container.childNodes.length; i++) {
    within += nodeLength(container.childNodes[i]);
  }
  return offsetOfPoint(root, parent, index) + within;
}

function caretOffsetWithin(root: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) {
    return 0;
  }
  const range = selection.getRangeAt(0);
  return offsetOfPoint(root, range.endContainer, range.endOffset);
}

function selectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if (!anchor || !focus || !root.contains(anchor) || !root.contains(focus)) return null;
  return {
    start: offsetOfPoint(root, anchor, selection.anchorOffset),
    end: offsetOfPoint(root, focus, selection.focusOffset),
  };
}

function pointForOffset(root: HTMLElement, target: number): { node: Node; offset: number } | null {
  const state = { left: target };
  const visit = (parent: Node): { node: Node; offset: number } | null => {
    const children = parent.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === Node.TEXT_NODE) {
        const length = visibleTextLength(child as Text);
        if (length === 0) continue;
        if (state.left <= length) return { node: child, offset: state.left };
        state.left -= length;
      } else if (child.nodeName === "BR") {
        if (state.left === 0) return { node: parent, offset: i };
        state.left -= 1;
        if (state.left === 0) return { node: parent, offset: i + 1 };
      } else {
        const found = visit(child);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(root);
}

function placeCaret(root: HTMLElement, offset: number) {
  const point = pointForOffset(root, offset) ?? { node: root, offset: root.childNodes.length };
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function appendWithBreaks(fragment: DocumentFragment, text: string) {
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) fragment.appendChild(document.createElement("br"));
    if (line.length > 0) fragment.appendChild(document.createTextNode(line));
  });
}

function editorPlainText(root: HTMLElement): string {
  let out = "";
  const visit = (node: Node) => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE) out += (child.textContent ?? "").replace(/\u200b/g, "");
      else if (child.nodeName === "BR") out += "\n";
      else visit(child);
    }
  };
  visit(root);
  return out;
}

function paintEditor(el: HTMLElement, text: string, names: readonly string[]) {
  if (text.length === 0) {
    el.replaceChildren();
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const part of slashHighlightParts(text, names)) {
    if (part.highlighted) {
      const span = document.createElement("span");
      span.className = "text-primary";
      span.textContent = part.text;
      fragment.appendChild(span);
    } else {
      appendWithBreaks(fragment, part.text);
    }
  }
  if (text.endsWith("\n")) fragment.appendChild(document.createTextNode(CARET_ANCHOR));
  el.replaceChildren(fragment);
}

export const InputForm = forwardRef<HTMLDivElement, InputFormProps>(function InputForm(
  {
    onSubmit,
    onCancel,
    isLoading,
    isRateLimited = false,
    rateLimitRemainingSeconds = 0,
    placeholder,
    inputLabel,
  },
  ref,
) {
  const [internalInputValue, setInternalInputValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [catalog, setCatalog] = useState<SubagentOption[]>([]);
  const [loadStatus, setLoadStatus] = useState<SubagentSlashMenuStatus>("loading");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const caretRef = useRef(0);
  const fetchGen = useRef(0);
  const composingRef = useRef(false);
  const listId = useId();

  const token = slashTokenAtCaret(internalInputValue, caret);
  const menuOpen = token !== null && !menuDismissed && !isLoading;
  const filtered = token ? filterSubagents(catalog, token.query) : [];

  const syncCaret = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const offset = caretOffsetWithin(el);
    caretRef.current = offset;
    setCaret(offset);
  }, []);

  useLayoutEffect(() => {
    if (composingRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    paintEditor(el, internalInputValue, catalog.map((option) => option.name));
    if (document.activeElement === el) {
      placeCaret(el, caretRef.current);
    }
  }, [internalInputValue, catalog]);

  useEffect(() => {
    setMenuDismissed(false);
  }, [token?.start, token?.query]);

  useEffect(() => {
    if (!menuOpen) return;

    const gen = ++fetchGen.current;
    setLoadStatus("loading");

    void (async () => {
      try {
        const options = await loadSubagentOptions();
        if (gen !== fetchGen.current) return;
        setCatalog(options);
        setLoadStatus(options.length === 0 ? "empty" : "ready");
      } catch {
        if (gen !== fetchGen.current) return;
        setCatalog([]);
        setLoadStatus("error");
      }
    })();
  }, [menuOpen]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [token?.query, catalog, loadStatus]);

  const insertSubagent = useCallback(
    (name: string) => {
      if (!token) return;
      const { value: next, caret: nextCaret } = applySubagentName(
        internalInputValue,
        token.start,
        name,
      );
      caretRef.current = nextCaret;
      setInternalInputValue(next);
      setCaret(nextCaret);
      setMenuDismissed(true);
      editorRef.current?.focus();
    },
    [token, internalInputValue, caret],
  );

  const syncFromDom = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const raw = editorPlainText(el);
    const next = raw.replace(/\n/g, "").length === 0 ? "" : raw;
    const offset = caretOffsetWithin(el);
    caretRef.current = offset;
    setCaret(offset);
    if (next !== internalInputValue) setInternalInputValue(next);
  }, [internalInputValue]);

  const insertPlainText = useCallback((pasted: string) => {
    const el = editorRef.current;
    const range = el ? selectionOffsets(el) : null;
    const start = range ? Math.min(range.start, range.end) : caretRef.current;
    const end = range ? Math.max(range.start, range.end) : caretRef.current;
    const next = internalInputValue.slice(0, start) + pasted + internalInputValue.slice(end);
    const nextCaret = start + pasted.length;
    caretRef.current = nextCaret;
    setCaret(nextCaret);
    setInternalInputValue(next);
  }, [internalInputValue]);

  const handleInternalSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!internalInputValue.trim()) return;
    onSubmit(internalInputValue);
    caretRef.current = 0;
    setInternalInputValue("");
    setCaret(0);
    setMenuDismissed(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      const next = `${internalInputValue.slice(0, caret)}\n${internalInputValue.slice(caret)}`;
      caretRef.current = caret + 1;
      setCaret(caret + 1);
      setInternalInputValue(next);
      return;
    }
    if (menuOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuDismissed(true);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (filtered.length === 0) return;
        setHighlightedIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (filtered.length === 0) return;
        setHighlightedIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (menuOpen && (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey))) {
        if (loadStatus === "ready" && filtered.length > 0) {
          e.preventDefault();
          const choice = filtered[highlightedIndex] ?? filtered[0];
          if (choice) insertSubagent(choice.name);
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && loadStatus === "loading")) {
          e.preventDefault();
          return;
        }
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleInternalSubmit();
    }
  };

  const isSubmitDisabled = !internalInputValue.trim() || isLoading || isRateLimited;

  const menuStatus: SubagentSlashMenuStatus =
    loadStatus === "ready" ? "ready" : loadStatus;

  return (
    <form
      onSubmit={handleInternalSubmit}
      className="flex flex-col gap-2 p-3 pb-4"
    >
      {isRateLimited && rateLimitRemainingSeconds > 0 && (
        <Alert
          variant="warning"
          isInline
          title={`Rate limited. Try again in ${rateLimitRemainingSeconds}s`}
          className="mb-1"
        />
      )}
      <div
        className={`relative rounded-2xl border shadow-card transition-all duration-200 ${
          isLoading
            ? "border-muted bg-muted/30"
            : "border-border bg-card focus-within:border-primary/40 focus-within:shadow-elevated"
        }`}
      >
        {menuOpen ? (
          <SubagentSlashMenu
            options={filtered}
            highlightedIndex={highlightedIndex}
            status={menuStatus}
            listId={listId}
            onHighlight={setHighlightedIndex}
            onSelect={insertSubagent}
          />
        ) : null}
        <div
          ref={(node) => {
            editorRef.current = node;
            assignRef(ref, node);
          }}
          contentEditable={!isLoading}
          suppressContentEditableWarning
          autoFocus
          role="textbox"
          aria-multiline="true"
          aria-label={inputLabel ?? "Type a message"}
          data-placeholder={
            isLoading
              ? "Waiting for response..."
              : (placeholder ?? "Ask me anything about the data...")
          }
          onInput={() => {
            if (composingRef.current) return;
            syncFromDom();
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
            syncFromDom();
          }}
          onClick={syncCaret}
          onKeyUp={syncCaret}
          onKeyDown={handleKeyDown}
          onPaste={(e) => {
            e.preventDefault();
            insertPlainText(e.clipboardData.getData("text/plain"));
          }}
          onDrop={(e) => {
            e.preventDefault();
            const pasted = e.dataTransfer.getData("text/plain");
            if (pasted) insertPlainText(pasted);
          }}
          className={`w-full whitespace-pre-wrap break-words border-0 bg-transparent px-4 pt-3.5 pb-12 text-sm leading-relaxed min-h-[56px] max-h-[200px] overflow-y-auto rounded-2xl empty:before:text-muted-foreground empty:before:opacity-60 empty:before:content-[attr(data-placeholder)] focus:outline-none ${isLoading ? "cursor-not-allowed opacity-50" : ""}`}
          style={{ boxShadow: "none" }}
        />
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
          {isLoading ? (
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              onClick={onCancel}
              aria-label="Cancel streaming"
            >
              <StopCircle className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitDisabled}
              aria-label={
                isRateLimited
                  ? `Wait ${rateLimitRemainingSeconds} seconds`
                  : "Send message"
              }
              className={`flex items-center justify-center rounded-full transition-all duration-200 ${
                isRateLimited ? "min-w-[88px] h-8 px-2" : "w-8 h-8"
              } ${
                isSubmitDisabled
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md"
              }`}
            >
              {isRateLimited ? (
                <span className="text-xs font-medium tabular-nums">
                  Wait ({rateLimitRemainingSeconds}s)
                </span>
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground text-center mt-2">
        You are interacting with an AI tool. Always review AI-generated content prior to use.
      </p>
    </form>
  );
});
