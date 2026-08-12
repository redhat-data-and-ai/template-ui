import { useState, useEffect, useCallback } from 'react';
import { Alert, AlertActionCloseButton } from '@patternfly/react-core';

type AnnouncementType = 'info' | 'warning' | 'danger' | 'success';

interface AnnouncementResponse {
  enabled: boolean;
  message?: string;
  type?: string;
}

function messageHash(message: string): string {
  let h = 0;
  for (let i = 0; i < message.length; ) {
    const cp = message.codePointAt(i);
    if (cp === undefined) break;
    h = Math.trunc(Math.imul(31, h) + cp);
    i += cp > 0xffff ? 2 : 1;
  }
  return String(h);
}

function toVariant(type: string | undefined): AnnouncementType {
  if (type === 'warning' || type === 'danger' || type === 'success' || type === 'info') {
    return type;
  }
  return 'info';
}

const STORAGE_PREFIX = 'announcement_dismissed_';

export function AnnouncementBanner() {
  const [payload, setPayload] = useState<AnnouncementResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/announcement');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as AnnouncementResponse;
        if (cancelled) return;
        setPayload(data);
        if (data.enabled && data.message) {
          const key = STORAGE_PREFIX + messageHash(data.message);
          if (sessionStorage.getItem(key) === '1') {
            setDismissed(true);
          }
        }
      } catch {
        // ignore fetch errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClose = useCallback(() => {
    if (payload?.message) {
      try {
        sessionStorage.setItem(STORAGE_PREFIX + messageHash(payload.message), '1');
      } catch { /* storage full or unavailable */ }
    }
    setDismissed(true);
  }, [payload?.message]);

  if (!payload?.enabled || !payload.message || dismissed) {
    return null;
  }

  const variant = toVariant(payload.type);

  return (
    <div className="w-full shrink-0 border-b border-border">
      <Alert
        variant={variant}
        isInline
        isExpandable={false}
        title={payload.message}
        actionClose={<AlertActionCloseButton onClose={handleClose} />}
      />
    </div>
  );
}
