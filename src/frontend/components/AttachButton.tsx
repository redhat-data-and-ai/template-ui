import { useRef } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAttachmentUpload } from '../hooks/useAttachmentUpload';
import type { Attachment } from '../services/attachments-api';

interface AttachButtonProps {
  threadId: string;
  onUploaded: (attachments: Attachment[], summary: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}

/** Attach files to the current thread. */
export function AttachButton({
  threadId,
  onUploaded,
  onError,
  disabled,
}: AttachButtonProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const { upload, busy } = useAttachmentUpload({ threadId, onUploaded, onError });

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          void upload(Array.from(e.target.files ?? []));
          // Reset, so picking the same file twice in a row still fires
          // onChange.
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled || busy}
        aria-label={t('input.attachFiles')}
        title={t('input.attachFiles')}
        className="inline-flex items-center justify-center h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 disabled:opacity-50 transition-colors"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="w-5 h-5" aria-hidden="true" />
        )}
      </button>
    </>
  );
}
