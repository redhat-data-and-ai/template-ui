import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

export interface Provenance {
  model?: string;
  finish_reason?: string;
  truncated?: boolean;
  routed_tier?: string;
  routed_by?: string;
  fallback_from?: string;
  cached?: boolean;
  empty?: boolean;
}

/**
 * Why this answer looks the way it does.
 *
 * Which model produced it, whether routing picked a tier, whether a
 * fallback answered, whether it was cut short. All of that shaped
 * the reply and none of it was visible in the transcript, so the
 * reader had no way to weigh an answer differently from any other.
 *
 * Deliberately quiet: one small line, below the message, only when
 * there is something to say. The common case — one model, ordinary
 * stop — shows the model name and nothing else, because a badge per
 * turn announcing that everything is normal is noise that teaches
 * people to stop reading it.
 */
export function MessageProvenance({ provenance }: { provenance?: Provenance | null }) {
  const { t } = useTranslation();
  if (!provenance || Object.keys(provenance).length === 0) return null;

  const { model, truncated, routed_tier, routed_by, fallback_from, cached, empty } =
    provenance;

  // Ordered by how much it should change the reader's confidence.
  const warnings: string[] = [];
  if (truncated) warnings.push(t('provenance.truncated'));
  if (empty) warnings.push(t('provenance.empty'));
  if (fallback_from) {
    warnings.push(t('provenance.fallback', { from: fallback_from }));
  }

  const notes: string[] = [];
  if (routed_tier) {
    notes.push(
      routed_by
        ? t('provenance.routedBy', { tier: routed_tier, how: routed_by })
        : t('provenance.routed', { tier: routed_tier }),
    );
  }
  if (cached) notes.push(t('provenance.cached'));

  if (!model && warnings.length === 0 && notes.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      {model && <code className="text-[11px]">{model}</code>}
      {notes.map((note) => (
        <span key={note}>{note}</span>
      ))}
      {warnings.map((warning) => (
        // Warnings carry an icon and a colour because they change
        // whether the answer can be trusted as complete; the notes
        // beside them do not.
        <span
          key={warning}
          className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500"
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {warning}
        </span>
      ))}
    </div>
  );
}
