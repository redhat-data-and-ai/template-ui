import { forwardRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { SquarePen, ArrowUp, StopCircle } from "lucide-react";
import { Alert } from "@patternfly/react-core";
import { buildAppPath } from '../lib/app-paths';

interface InputFormProps {
  onSubmit: (inputValue: string) => void;
  onCancel: () => void;
  onNewChat?: () => void;
  isLoading: boolean;
  hasHistory: boolean;
  isRateLimited?: boolean;
  rateLimitRemainingSeconds?: number;
}

export const InputForm = forwardRef<HTMLTextAreaElement, InputFormProps>(function InputForm(
  {
  onSubmit,
  onCancel,
  onNewChat,
  isLoading,
  hasHistory,
  isRateLimited = false,
  rateLimitRemainingSeconds = 0,
  },
  ref,
) {
  const [internalInputValue, setInternalInputValue] = useState("");

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

  const isSubmitDisabled = !internalInputValue.trim() || isLoading || isRateLimited;

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
      <div className={`relative rounded-2xl border shadow-card transition-all duration-200 ${
        isLoading
          ? "border-muted bg-muted/30"
          : "border-border bg-card focus-within:border-primary/40 focus-within:shadow-elevated"
      }`}>
        <textarea
          ref={ref}
          autoFocus
          value={internalInputValue}
          onChange={(e) => setInternalInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder={isLoading ? "Waiting for response..." : "Ask me anything about the data..."}
          aria-label="Type a message"
          className={`w-full resize-none border-0 bg-transparent px-4 pt-3.5 pb-12 text-sm leading-relaxed min-h-[56px] max-h-[200px] rounded-2xl placeholder:opacity-60 focus:outline-none focus:ring-0 focus:border-transparent focus:shadow-none ${isLoading ? "cursor-not-allowed opacity-50" : ""}`}
          style={{ boxShadow: 'none' }}
          rows={1}
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
      {hasHistory && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => onNewChat ? onNewChat() : (globalThis.location.href = buildAppPath('/'))}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
          >
            <SquarePen size={12} />
            New Chat
          </button>
        </div>
      )}
    </form>
  );
});
