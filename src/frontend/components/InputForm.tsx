import { useState } from "react";
import { Button } from "./ui/button";
import { SquarePen, Send, StopCircle, Microscope } from "lucide-react";
import { Textarea } from "./ui/textarea";

interface InputFormProps {
  onSubmit: (inputValue: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  hasHistory: boolean;
  deepResearchEnabled: boolean;
  deepResearchLocked?: boolean;
  onToggleDeepResearch: () => void;
}

function getPlaceholder(isLoading: boolean, deepResearchEnabled: boolean): string {
  if (isLoading) return "Waiting for response...";
  if (deepResearchEnabled) return "Ask a complex research question...";
  return "Ask me anything about the data";
}

function getToggleStyle(enabled: boolean, locked: boolean): string {
  if (locked) return "bg-purple-600/30 border border-purple-500/50 text-purple-300 opacity-60 cursor-not-allowed";
  if (enabled) return "bg-purple-600/30 border border-purple-500/50 text-purple-300 hover:bg-purple-600/40 cursor-pointer";
  return "bg-neutral-700 border border-neutral-600 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-300 cursor-pointer";
}

export const InputForm: React.FC<InputFormProps> = ({
  onSubmit,
  onCancel,
  isLoading,
  hasHistory,
  deepResearchEnabled,
  deepResearchLocked = false,
  onToggleDeepResearch,
}) => {
  const [internalInputValue, setInternalInputValue] = useState("");

  const handleInternalSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!internalInputValue.trim() || isLoading) return;
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
      className={`flex flex-col gap-2 p-3 pb-4`}
    >
      <div
        className={`flex flex-row items-center justify-between text-white rounded-3xl rounded-bl-sm ${
          hasHistory ? "rounded-br-sm" : ""
        } break-words min-h-7 bg-neutral-700 px-4 pt-3 `}
      >
        <Textarea
          value={internalInputValue}
          onChange={(e) => setInternalInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder={getPlaceholder(isLoading, deepResearchEnabled)}
          className={`w-full text-neutral-100 placeholder-neutral-500 resize-none border-0 focus:outline-none focus:ring-0 outline-none focus-visible:ring-0 shadow-none
                        md:text-base  min-h-[56px] max-h-[200px] disabled:opacity-50 disabled:cursor-not-allowed`}
          rows={1}
        />
        <div className="-mt-3">
          {isLoading ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-red-500 hover:text-red-400 hover:bg-red-500/10 p-2 cursor-pointer rounded-full transition-all duration-200"
              onClick={onCancel}
            >
              <StopCircle className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              type="submit"
              variant="ghost"
              className={`${
                isSubmitDisabled
                  ? "text-neutral-500"
                  : "text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
              } p-2 cursor-pointer rounded-full transition-all duration-200 text-base`}
              disabled={isSubmitDisabled}
            >
              Ask
              <Send className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-row gap-2">
          <button
            type="button"
            onClick={deepResearchLocked ? undefined : onToggleDeepResearch}
            disabled={deepResearchLocked}
            title={deepResearchLocked ? "Deep Research cannot be disabled in an active research chat" : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl rounded-t-sm text-sm font-medium transition-all duration-200 ${
              getToggleStyle(deepResearchEnabled, deepResearchLocked)
            }`}
          >
            <Microscope className={`h-4 w-4 ${deepResearchEnabled ? "text-purple-400" : ""}`} />
            Deep Research
          </button>
        </div>
        {hasHistory && (
          <Button
            className="bg-neutral-700 border-neutral-600 text-neutral-300 cursor-pointer rounded-xl rounded-t-sm pl-2 "
            variant="default"
            onClick={() => window.location.reload()}
          >
            <SquarePen size={16} />
             New Chat
          </Button>
        )}
      </div>
    </form>
  );
};
