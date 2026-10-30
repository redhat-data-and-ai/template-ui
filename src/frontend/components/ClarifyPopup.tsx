import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageCircleQuestion, Send, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface ClarifyPopupProps {
  question: string;
  onRespond: (response: string) => void;
  onDismiss: () => void;
}

export function ClarifyPopup({ question, onRespond, onDismiss }: ClarifyPopupProps) {
  const [response, setResponse] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = response.trim();
    if (trimmed) {
      onRespond(trimmed);
    }
  }, [response, onRespond]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        onDismiss();
      }
    },
    [handleSubmit, onDismiss],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn"
      onClick={onDismiss}
    >
      <div
        className="relative bg-background border border-border rounded-2xl shadow-2xl w-[90vw] max-w-[520px] overflow-hidden animate-fadeInUpSmooth"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-card/80">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageCircleQuestion className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Quick Clarification</h3>
            <p className="text-xs text-muted-foreground">Help me give you a better answer</p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Question */}
        <div className="px-5 py-4">
          <p className="text-sm text-foreground leading-relaxed">{question}</p>
        </div>

        {/* Input */}
        <div className="px-5 pb-5">
          <div className="relative">
            <textarea
              ref={inputRef}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your answer..."
              rows={2}
              className={cn(
                'w-full resize-none rounded-xl border border-border bg-muted/50 px-4 py-3 pr-12',
                'text-sm text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50',
                'transition-colors',
              )}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!response.trim()}
              className={cn(
                'absolute right-2.5 bottom-2.5 p-2 rounded-lg transition-all',
                response.trim()
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
              aria-label="Send response"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Press Enter to send, Shift+Enter for new line, Esc to skip
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Check if an interrupt value represents a clarification request.
 */
export function isClarifyInterrupt(value: unknown): value is { type: 'clarify'; question: string; options?: string[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: string }).type === 'clarify' &&
    typeof (value as { question?: string }).question === 'string'
  );
}
