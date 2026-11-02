import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { buildAppPath } from "../lib/app-paths";
import { placeComposerCaret } from "./SubagentComposer";
import {
  activeSlashQuery,
  applySlashSelection,
  filterSubagents,
  parseSubagentCatalog,
  type SubagentOption,
} from "./slash-subagents";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface UseSubagentSlashMenuArgs {
  value: string;
  setValue: (next: string) => void;
  disabled?: boolean;
  editorRef: RefObject<HTMLElement | null>;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useSubagentSlashMenu({
  value,
  setValue,
  disabled = false,
  editorRef,
}: UseSubagentSlashMenuArgs) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const requestId = useRef(0);
  const [caret, setCaret] = useState(0);
  const [items, setItems] = useState<SubagentOption[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [highlight, setHighlight] = useState(0);
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);

  const token = disabled ? null : activeSlashQuery(value, caret);
  const tokenStart = token?.start ?? -1;
  const hasToken = token !== null;
  const isOpen = token !== null && token.start !== dismissedStart;
  const matches = token ? filterSubagents(items, token.query) : [];
  const activeIndex = matches.length === 0 ? 0 : Math.min(highlight, matches.length - 1);

  useEffect(() => {
    if (hasToken) return;
    setDismissedStart(null);
  }, [hasToken]);

  useEffect(() => {
    setHighlight(0);
  }, [tokenStart, token?.query]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    const id = ++requestId.current;
    setStatus("loading");
    setItems([]);

    fetch(buildAppPath("/api/config/subagents"), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load subagents");
        return parseSubagentCatalog(await response.json());
      })
      .then((next) => {
        if (id !== requestId.current) return;
        setItems(next);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || id !== requestId.current) return;
        setItems([]);
        setStatus("error");
      });

    return () => controller.abort();
  }, [isOpen, tokenStart]);

  useEffect(() => {
    if (!isOpen || tokenStart < 0) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target) || editorRef.current?.contains(target)) return;
      setDismissedStart(tokenStart);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isOpen, tokenStart, editorRef]);

  useLayoutEffect(() => {
    const el = editorRef.current;
    const next = pendingCaret.current;
    if (!el || next == null) return;
    placeComposerCaret(el, next);
    pendingCaret.current = null;
  });

  const syncCaret = (next: number) => setCaret(next);

  const selectIndex = (index: number) => {
    const item = matches[index];
    if (!item || !token) return;
    const next = applySlashSelection(value, token.start, item.name);
    if (next.value === value) {
      setDismissedStart(token.start);
      pendingCaret.current = next.caret;
      setCaret(next.caret);
      if (editorRef.current) placeComposerCaret(editorRef.current, next.caret);
      return;
    }
    pendingCaret.current = next.caret;
    setCaret(next.caret);
    setValue(next.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): boolean => {
    if (!isOpen || !token) return false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (matches.length === 0) return true;
      setHighlight((current) => (Math.min(current, matches.length - 1) + 1) % matches.length);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (matches.length === 0) return true;
      setHighlight((current) => {
        const index = Math.min(current, matches.length - 1);
        return (index - 1 + matches.length) % matches.length;
      });
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setDismissedStart(token.start);
      return true;
    }
    if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      if (event.key === "Enter" && status === "loading") {
        event.preventDefault();
        return true;
      }
      if (matches.length === 0) return false;
      event.preventDefault();
      selectIndex(activeIndex);
      return true;
    }
    return false;
  };

  return {
    isOpen,
    status,
    matches,
    highlight: activeIndex,
    listId,
    rootRef,
    syncCaret,
    onKeyDown,
    selectIndex,
    setHighlight,
    catalog: items,
  };
}
