import {
  forwardRef,
  useCallback,
  useEffect,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import { ArrowUp, Loader2, Paperclip, StopCircle } from "lucide-react";
import { Alert } from "@patternfly/react-core";
import { AttachButton } from "./AttachButton";
import {
  dragHasFiles,
  filesFromPaste,
  useAttachmentUpload,
} from "../hooks/useAttachmentUpload";
import { useTranslation } from "react-i18next";
import type { Attachment } from "../services/attachments-api";

interface InputFormProps {
  onSubmit: (inputValue: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  isRateLimited?: boolean;
  rateLimitRemainingSeconds?: number;
  /** Thread to attach files to. Omit to hide the attach button. */
  threadId?: string;
  onAttached?: (attachments: Attachment[], summary: string) => void;
  /** Overrides the default placeholder, which the home screen takes
      from config rather than from the translation catalogue. */
  placeholder?: string;
  /** Overrides the textarea's accessible name. */
  ariaLabel?: string;
}

export const InputForm = forwardRef<HTMLTextAreaElement, InputFormProps>(function InputForm(
  {
  onSubmit,
  onCancel,
  isLoading,
  isRateLimited = false,
  rateLimitRemainingSeconds = 0,
  threadId,
  onAttached,
  placeholder,
  ariaLabel,
  },
  ref,
) {
  const { t } = useTranslation();
  const [internalInputValue, setInternalInputValue] = useState("");
  const [attached, setAttached] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);

  const onUploaded = useCallback(
    (files: Attachment[], summary: string) => {
      setAttachError(null);
      setAttached((prev) => [...prev, ...files]);
      onAttached?.(files, summary);
    },
    [onAttached],
  );
  const { upload, busy: uploading } = useAttachmentUpload({
    threadId,
    onUploaded,
    onError: setAttachError,
  });

  // Drag state is tracked on the window, not on the composer. People
  // drop a file onto the conversation they are reading, not onto the
  // text box — a drop target that small reads as "drag and drop is
  // not supported".
  //
  // `dragenter`/`dragleave` fire for every element crossed, so a depth
  // counter is the only way to know the pointer has actually left:
  // tracking a boolean makes the overlay flicker on each child.
  useEffect(() => {
    if (!threadId) return;
    let depth = 0;
    const enter = (e: globalThis.DragEvent) => {
      if (!dragHasFiles(e)) return;
      depth += 1;
      setDraggingFiles(true);
    };
    const leave = (e: globalThis.DragEvent) => {
      if (!dragHasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDraggingFiles(false);
    };
    // Without preventDefault on dragover the browser navigates away
    // to the dropped file, losing the conversation.
    const over = (e: globalThis.DragEvent) => {
      if (dragHasFiles(e)) e.preventDefault();
    };
    const drop = (e: globalThis.DragEvent) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDraggingFiles(false);
      void upload(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [threadId, upload]);

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!threadId) return;
    const files = filesFromPaste(e);
    if (!files.length) return;
    // Only once it is certain this is a file paste — otherwise an
    // ordinary text paste would be swallowed.
    e.preventDefault();
    void upload(files);
  };

  // Pill while it is a single empty line; panel once it holds an
  // attachment or the text has wrapped.
  const isExpanded =
    attached.length > 0 || internalInputValue.includes('\n') || internalInputValue.length > 80;

  const handleInternalSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!internalInputValue.trim()) return;
    onSubmit(internalInputValue);
    setInternalInputValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleInternalSubmit();
    }
  };

  // Blocked while a file is still uploading. Sending first means the
  // run starts before the attachment lands on the thread, so the model
  // answers about a document it cannot see — and the file appears in
  // the composer a second later, which looks like it was attached.
  const isSubmitDisabled =
    !internalInputValue.trim() || isLoading || isRateLimited || uploading;

  return (
    <>
      {draggingFiles && (
        // Covers the viewport because that is the drop target.
        // `pointer-events-none` so it cannot steal the drop from the
        // window listener that is actually handling it.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 pointer-events-none"
          aria-hidden="true"
        >
          <div className="rounded-2xl border-2 border-dashed border-primary bg-card px-8 py-6 text-center shadow-elevated">
            <Paperclip className="mx-auto mb-2 h-6 w-6 text-primary" />
            <p className="text-sm font-medium text-foreground">
              {t('input.dropToAttach')}
            </p>
          </div>
        </div>
      )}
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
      {attachError && (
        <Alert variant="danger" isInline title={attachError} className="mb-1" />
      )}
      {uploading && (
        <p
          className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"
          role="status"
        >
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          {t('input.attaching')}
        </p>
      )}
      <div
        className={cn(
          "composer relative border shadow-card transition-all duration-200",
          // Pill while it holds one line and nothing else; a panel
          // once there is an attachment or the text wraps. The shape
          // is the affordance: a pill says "type here", a panel says
          // "this has contents".
          isExpanded ? "rounded-3xl" : "rounded-full",
          isLoading
            ? "border-muted bg-muted/30"
            : "border-border bg-card focus-within:border-primary/40 focus-within:shadow-elevated",
        )}
      >
        {attached.length > 0 && (
          <ul
            className="flex flex-wrap gap-2 list-none p-0 px-3 pt-3"
            aria-label={t('input.attachedFiles')}
          >
            {attached.map((file) => (
              <li
                key={file.path}
                className="w-[104px] rounded-xl border border-border bg-secondary/50 p-2.5"
              >
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {file.filename.includes('.')
                    ? file.filename.split('.').pop()
                    : 'file'}
                </span>
                <span className="mt-1.5 block text-xs leading-tight text-foreground line-clamp-2 break-all">
                  {file.filename}
                </span>
                {/* Flagged, because the model is reading a prefix of
                    a document the user believes it has in full. */}
                {!file.text_extracted && (
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {t('input.notReadable')}
                  </span>
                )}
                {file.truncated && (
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {t('input.truncated')}
                  </span>
                )}
                {file.degraded && (
                  <span
                    className="mt-1 block text-[10px] text-muted-foreground"
                    title={file.degraded}
                  >
                    {t('input.basicParse')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-1">
          <div className="flex items-center pb-1.5 pl-1.5">
          {threadId && (
            <AttachButton
              threadId={threadId}
              disabled={isLoading}
              onUploaded={onUploaded}
              onError={setAttachError}
            />
          )}
          </div>
        <textarea
          ref={ref}
          autoFocus
          value={internalInputValue}
          onChange={(e) => setInternalInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={isLoading}
          placeholder={
            isLoading ? t('input.waiting') : (placeholder || t('input.askAnything'))
          }
          aria-label={ariaLabel || t('input.typeMessage')}
          className={cn(
            "flex-1 resize-none border-0 bg-transparent py-3 text-sm leading-relaxed max-h-[200px] placeholder:opacity-60 focus:outline-none focus:ring-0 focus:border-transparent focus:shadow-none",
            isExpanded ? "px-4 min-h-[40px]" : "px-1 min-h-[24px]",
            isLoading && "cursor-not-allowed opacity-50",
          )}
          style={{ boxShadow: 'none' }}
          rows={1}
        />
          <div className="flex items-center gap-1.5 pb-1.5 pr-1.5">
          {isLoading ? (
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              onClick={onCancel}
              aria-label={t('input.cancelStreaming')}
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
                isRateLimited ? "min-w-[88px] h-9 px-2" : "w-9 h-9"
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
      </div>
      <p className="text-[11px] text-muted-foreground/70 text-center mt-1.5">
        You are interacting with an AI tool. Always review AI-generated content prior to use.
      </p>
    </form>
    </>
  );
});
