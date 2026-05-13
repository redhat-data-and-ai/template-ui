import { useState } from "react";
import { SquarePen, ArrowUp, StopCircle } from "lucide-react";

interface InputFormProps {
  onSubmit: (inputValue: string) => void;
  onCancel: () => void;
  onNewChat?: () => void;
  isLoading: boolean;
  hasHistory: boolean;
}

export const InputForm: React.FC<InputFormProps> = ({
  onSubmit,
  onCancel,
  onNewChat,
  isLoading,
  hasHistory,
}) => {
  const [internalInputValue, setInternalInputValue] = useState("");

  const handleInternalSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!internalInputValue.trim()) return;
    onSubmit(internalInputValue);
    setInternalInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleInternalSubmit();
    }
  };

  const isSubmitDisabled = !internalInputValue.trim() || isLoading;

  return (
    <form
      onSubmit={handleInternalSubmit}
      className="flex flex-col gap-2 p-3 pb-4"
    >
      <div className="relative bg-card border border-border rounded-2xl shadow-elevated focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all duration-200">
        <textarea
          value={internalInputValue}
          onChange={(e) => setInternalInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything about the data..."
          className="w-full text-foreground placeholder-muted-foreground resize-none border-0 focus:outline-none focus:ring-0 outline-none bg-transparent px-4 pt-3.5 pb-12 md:text-[15px] min-h-[56px] max-h-[200px] rounded-2xl"
          rows={1}
        />
        <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
          {isLoading ? (
            <button
              type="button"
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              onClick={onCancel}
            >
              <StopCircle className="h-4.5 w-4.5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200 ${
                isSubmitDisabled
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "gradient-brand text-white shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
              }`}
            >
              <ArrowUp className="h-4.5 w-4.5" />
            </button>
          )}
        </div>
      </div>
      {hasHistory && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => onNewChat ? onNewChat() : (window.location.href = '/')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
          >
            <SquarePen size={12} />
            New Chat
          </button>
        </div>
      )}
    </form>
  );
};
