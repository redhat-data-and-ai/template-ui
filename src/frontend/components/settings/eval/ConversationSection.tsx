import type { ConvStats } from './eval-types';
import { friendlyConversationName } from './eval-utils';

interface ConversationSectionProps {
  byConversation: Record<string, ConvStats>;
}

/** Lists all conversations with their pass/fail counts and overall pass rate. */
export function ConversationSection({ byConversation }: ConversationSectionProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Conversations
      </p>
      <div className="rounded-lg border border-border overflow-hidden">
        {Object.entries(byConversation).map(([key, stats], i) => {
          const pass = stats.pass ?? 0;
          const fail = stats.fail ?? 0;
          const total = pass + fail;
          const rate = total > 0 ? Math.round((pass / total) * 100) : 0;
          const allPass = fail === 0;

          return (
            <div
              key={key}
              className={`flex items-center justify-between px-3 py-2.5 text-sm ${
                i > 0 ? 'border-t border-border' : ''
              }`}
            >
              <span
                className="font-medium text-foreground truncate max-w-[60%]"
                title={key}
              >
                {friendlyConversationName(key)}
              </span>
              <div className="flex items-center gap-3">
                <span
                  className={`font-semibold ${allPass ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                >
                  {rate}%
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {pass}/{total} checks passed
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
