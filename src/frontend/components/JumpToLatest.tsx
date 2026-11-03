import { ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * A way back to the newest message.
 *
 * Needed the moment the transcript stopped yanking the reader to
 * the bottom: without auto-scroll, someone who has scrolled up to
 * check an earlier answer has no obvious way back, and a reply that
 * finishes off-screen is a reply they never see.
 *
 * Only rendered when the view is not already following along.
 */
export function JumpToLatest({
  hidden,
  onClick,
}: {
  hidden: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  if (hidden) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="jump-to-latest"
      aria-label={t('chat.jumpToLatest')}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-card backdrop-blur hover:bg-muted transition-colors"
    >
      <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
      {t('chat.jumpToLatest')}
    </button>
  );
}

export default JumpToLatest;
