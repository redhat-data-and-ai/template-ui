import { useEffect, useLayoutEffect, type KeyboardEvent, type Ref, type RefObject } from "react";
import { highlightSubagentMentions } from "./slash-subagents";

type CaretHost = HTMLElement & { __composerCaret?: number };

function offsetBefore(root: HTMLElement, stopNode: Node, stopOffset: number): number {
  let count = 0;
  const addNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) count += node.textContent?.length ?? 0;
    else if (node.nodeName === "BR") count += 1;
    else node.childNodes.forEach(addNode);
  };
  const visit = (node: Node): boolean => {
    if (node === stopNode) {
      if (node.nodeType === Node.TEXT_NODE) count += stopOffset;
      else {
        for (let index = 0; index < stopOffset && index < node.childNodes.length; index += 1) {
          addNode(node.childNodes[index]);
        }
      }
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      count += node.textContent?.length ?? 0;
      return false;
    }
    if (node.nodeName === "BR") {
      count += 1;
      return false;
    }
    for (const child of node.childNodes) {
      if (visit(child)) return true;
    }
    return false;
  };
  visit(root);
  return count;
}

export function caretOffset(root: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !root.contains(selection.focusNode)) {
    return plainText(root).length;
  }
  const range = selection.getRangeAt(0);
  return offsetBefore(root, range.endContainer, range.endOffset);
}

function placeRange(selection: Selection, node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function setCaretOffset(root: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  let remaining = Math.max(0, offset);
  const place = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        placeRange(selection, node, remaining);
        return true;
      }
      remaining -= length;
      return false;
    }
    if (node.nodeName === "BR") {
      if (remaining === 0) {
        const range = document.createRange();
        range.setStartBefore(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }
      remaining -= 1;
      if (remaining === 0) {
        const range = document.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }
      return false;
    }
    for (const child of node.childNodes) {
      if (place(child)) return true;
    }
    return false;
  };
  if (!place(root)) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

export function placeComposerCaret(root: HTMLElement, offset: number) {
  (root as CaretHost).__composerCaret = offset;
  setCaretOffset(root, offset);
}

function plainText(root: HTMLElement): string {
  return (root.innerText || root.textContent || "").replace(/\u00a0/g, " ").replace(/\n$/, "");
}

type MarkPart = { text: string; marked: boolean };

function domMarks(root: HTMLElement): MarkPart[] {
  const parts: MarkPart[] = [];
  const push = (text: string, marked: boolean) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last && last.marked === marked) last.text += text;
    else parts.push({ text, marked });
  };
  const walk = (node: Node, marked: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      push(node.textContent ?? "", marked);
      return;
    }
    if (node.nodeName === "BR") {
      push("\n", false);
      return;
    }
    const element = node as HTMLElement;
    const nextMarked = marked || Boolean(element.classList?.contains("underline"));
    element.childNodes.forEach((child) => walk(child, nextMarked));
  };
  root.childNodes.forEach((child) => walk(child, false));
  return parts;
}

function withoutBreaks(parts: MarkPart[]): MarkPart[] {
  const merged: MarkPart[] = [];
  for (const part of parts) {
    const text = part.text.replace(/\n/g, "");
    if (!text) continue;
    const last = merged[merged.length - 1];
    if (last && last.marked === part.marked) last.text += text;
    else merged.push({ text, marked: part.marked });
  }
  return merged;
}

function sameMarks(root: HTMLElement, value: string, names: readonly string[]): boolean {
  const actual = withoutBreaks(domMarks(root));
  const expected = withoutBreaks(
    highlightSubagentMentions(value, names).filter((part) => part.text),
  );
  if (actual.length !== expected.length) return false;
  return actual.every(
    (part, index) => part.marked === expected[index].marked && part.text === expected[index].text,
  );
}

function appendText(parent: Node, text: string) {
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) parent.appendChild(document.createElement("br"));
    if (line) parent.appendChild(document.createTextNode(line));
  });
}

function paint(root: HTMLElement, value: string, names: readonly string[]) {
  root.replaceChildren();
  for (const part of highlightSubagentMentions(value, names)) {
    if (!part.text) continue;
    if (part.marked) {
      const mark = document.createElement("span");
      mark.className = "underline font-semibold";
      appendText(mark, part.text);
      root.appendChild(mark);
    } else {
      appendText(root, part.text);
    }
  }
}

function rangeAtEnd(root: HTMLElement): Range {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  return range;
}

function rangeAtPoint(root: HTMLElement, x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const fromPoint = doc.caretRangeFromPoint?.(x, y);
  if (fromPoint && root.contains(fromPoint.startContainer)) return fromPoint;
  const position = doc.caretPositionFromPoint?.(x, y);
  if (!position || !root.contains(position.offsetNode)) return null;
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
}

function revealCaret(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !root.contains(selection.focusNode)) return;
  const range = selection.getRangeAt(0);
  if (typeof range.getBoundingClientRect !== "function") return;
  const rect = range.getBoundingClientRect();
  if (rect.height === 0 && rect.width === 0) return;
  const box = root.getBoundingClientRect();
  const style = getComputedStyle(root);
  const bottomLimit = box.bottom - Number.parseFloat(style.paddingBottom);
  const topLimit = box.top + Number.parseFloat(style.paddingTop);
  if (rect.bottom > bottomLimit) root.scrollTop += rect.bottom - bottomLimit + 2;
  else if (rect.top < topLimit) root.scrollTop -= topLimit - rect.top + 2;
}

function hasContentAfter(node: Node, root: HTMLElement): boolean {
  let current: Node | null = node;
  while (current && current !== root) {
    let sibling = current.nextSibling;
    while (sibling) {
      if (sibling.nodeName === "BR" || (sibling.textContent ?? "").length > 0) return true;
      sibling = sibling.nextSibling;
    }
    current = current.parentNode;
  }
  return false;
}

function insertLineBreak(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return;
  range.deleteContents();
  const lineBreak = document.createElement("br");
  range.insertNode(lineBreak);
  if (!hasContentAfter(lineBreak, root)) {
    lineBreak.after(document.createElement("br"));
  }
  range.setStartAfter(lineBreak);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertPlainText(root: HTMLElement, text: string, range?: Range | null) {
  const selection = window.getSelection();
  if (!selection || !text) return;
  let target = range && root.contains(range.startContainer) ? range : null;
  if (!target && selection.rangeCount > 0 && root.contains(selection.getRangeAt(0).startContainer)) {
    target = selection.getRangeAt(0);
  }
  if (!target) target = rangeAtEnd(root);
  target.deleteContents();
  const node = document.createTextNode(text);
  target.insertNode(node);
  target.setStartAfter(node);
  target.collapse(true);
  selection.removeAllRanges();
  selection.addRange(target);
}

function assignRef(ref: Ref<HTMLDivElement> | undefined, node: HTMLDivElement | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

export function SubagentComposer({
  value,
  onChange,
  names,
  disabled = false,
  placeholder,
  ariaLabel,
  className,
  editorRef,
  inputRef,
  onCaret,
  onKeyDown,
  ariaExpanded,
  ariaControls,
  id,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  names: readonly string[];
  disabled?: boolean;
  placeholder: string;
  ariaLabel: string;
  className: string;
  editorRef: RefObject<HTMLDivElement | null>;
  inputRef?: Ref<HTMLDivElement>;
  onCaret: (offset: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  ariaExpanded?: boolean;
  ariaControls?: string;
  id?: string;
  autoFocus?: boolean;
}) {
  useEffect(() => {
    if (autoFocus) editorRef.current?.focus();
  }, [autoFocus, editorRef]);

  useLayoutEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    if (!value) {
      if (plainText(root) !== "") root.replaceChildren();
      return;
    }
    if (sameMarks(root, value, names)) return;
    const stored = (root as CaretHost).__composerCaret ?? caretOffset(root);
    paint(root, value, names);
    setCaretOffset(root, Math.min(stored, value.length));
    revealCaret(root);
  }, [editorRef, names, value]);

  const publish = () => {
    const root = editorRef.current;
    if (!root) return;
    const text = plainText(root);
    const offset = caretOffset(root);
    (root as CaretHost).__composerCaret = offset;
    if (text !== value) onChange(text);
    onCaret(offset);
    revealCaret(root);
  };

  return (
    <div
      ref={(node) => {
        editorRef.current = node;
        assignRef(inputRef, node);
      }}
      id={id}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      contentEditable={disabled ? "false" : "true"}
      data-placeholder={placeholder}
      data-empty={value ? undefined : "true"}
      suppressContentEditableWarning
      onInput={publish}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.shiftKey) {
          event.preventDefault();
          const root = editorRef.current;
          if (!root) return;
          insertLineBreak(root);
          publish();
          return;
        }
        onKeyDown(event);
      }}
      onKeyUp={publish}
      onClick={publish}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onPaste={(event) => {
        event.preventDefault();
        const root = editorRef.current;
        if (!root) return;
        insertPlainText(root, event.clipboardData.getData("text/plain"));
        publish();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const root = editorRef.current;
        if (!root) return;
        const text = event.dataTransfer.getData("text/plain");
        if (!text) return;
        root.focus();
        insertPlainText(root, text, rangeAtPoint(root, event.clientX, event.clientY));
        publish();
      }}
      className={`subagent-composer whitespace-pre-wrap break-words overflow-y-auto text-foreground outline-none ${disabled ? "cursor-not-allowed opacity-50" : ""} ${className}`}
    />
  );
}
