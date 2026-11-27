import { forwardRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Alert, Button, TextArea } from "@patternfly/react-core";
import PaperPlaneIcon from "@patternfly/react-icons/dist/esm/icons/paper-plane-icon";
import StopCircleIcon from "@patternfly/react-icons/dist/esm/icons/stop-circle-icon";
import "./chat-composer.css";

export interface ChatComposerProps {
  onSubmit: (inputValue: string) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  isRateLimited?: boolean;
  rateLimitRemainingSeconds?: number;
  placeholder?: string;
  /** Accessible name of the textarea. */
  inputLabel?: string;
  /** Accessible name of the surrounding form. */
  formLabel?: string;
  id?: string;
}

/**
 * One bordered box holding a PatternFly TextArea and a send/stop button.
 * (PF MessageBar was not used: its send button is not a submit button, it
 * hides while empty and it ships its own container chrome.)
 */
export const ChatComposer = forwardRef<HTMLTextAreaElement, ChatComposerProps>(function ChatComposer(
  {
    onSubmit,
    onCancel,
    isLoading = false,
    isRateLimited = false,
    rateLimitRemainingSeconds = 0,
    placeholder = "Ask me anything about the data...",
    inputLabel = "Type a message",
    formLabel,
    id,
  },
  ref,
) {
  const [value, setValue] = useState("");

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!value.trim() || isLoading || isRateLimited) return;
    onSubmit(value);
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const isSubmitDisabled = !value.trim() || isLoading || isRateLimited;

  return (
    <form onSubmit={submit} aria-label={formLabel} className="composer-form">
      {isRateLimited && rateLimitRemainingSeconds > 0 && (
        <Alert
          variant="warning"
          isInline
          title={`Rate limited. Try again in ${rateLimitRemainingSeconds}s`}
          className="composer-alert"
        />
      )}
      <div className="composer-box">
        <TextArea
          ref={ref}
          id={id}
          autoFocus
          autoResize
          rows={1}
          resizeOrientation="none"
          value={value}
          onChange={(_e, v) => setValue(v)}
          onKeyDown={handleKeyDown}
          isDisabled={isLoading}
          placeholder={isLoading ? "Waiting for response..." : placeholder}
          aria-label={inputLabel}
          className="composer-input"
        />
        <div className="composer-actions">
          {isLoading ? (
            <Button
              type="button"
              variant="plain"
              onClick={onCancel}
              aria-label="Cancel streaming"
              icon={<StopCircleIcon />}
            />
          ) : (
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isDisabled={isSubmitDisabled}
              aria-label={isRateLimited ? `Wait ${rateLimitRemainingSeconds} seconds` : "Send message"}
              icon={isRateLimited ? undefined : <PaperPlaneIcon />}
            >
              {isRateLimited ? `Wait (${rateLimitRemainingSeconds}s)` : null}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
});
