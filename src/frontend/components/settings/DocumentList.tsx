import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@patternfly/react-core';
import { FileSpreadsheet, Loader2, Trash2, Upload } from 'lucide-react';
import {
  deleteDocument,
  formatBytes,
  listDocuments,
  uploadDocuments,
  type DocumentFile,
  type DocumentUsage,
} from '../../services/documents-api';
import { DocumentViewer } from './DocumentViewer';

/**
 * Files on the documents volume.
 *
 * The agent reads these at `/documents/` with the filesystem tools it
 * already has. It cannot write to them — uploads and edits happen
 * here, from a person — so this panel is the only way the volume
 * changes.
 *
 * The capacity bar is not decoration. The volume is 500 MB and a full
 * PVC fails every later write, not just the one that filled it, so
 * the number has to be visible before it is urgent rather than
 * appearing for the first time in an error.
 */
export function DocumentList() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [usage, setUsage] = useState<DocumentUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const { documents, usage: next } = await listDocuments();
      setFiles(documents);
      setUsage(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUpload = async (picked: FileList | null) => {
    if (!picked?.length) return;
    setBusy('upload');
    setError(null);
    try {
      await uploadDocuments(Array.from(picked));
      await refresh();
    } catch (e) {
      // The server's message names the file and the limit it broke,
      // which is the only useful part of a 507.
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  const handleDelete = async (path: string) => {
    // Shared, and gone for everyone. A single click with no step in
    // between is the wrong amount of friction for that.
    if (!window.confirm(t('documents.confirmDelete', { path }))) return;
    setBusy(`delete:${path}`);
    try {
      await deleteDocument(path);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not delete ${path}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {error && (
        <Alert variant="danger" isInline title={error} className="mb-3" />
      )}

      {usage && (
        <div className="mb-4">
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">
              {formatBytes(usage.used_bytes)} {t('documents.of')}{' '}
              {formatBytes(usage.capacity_bytes)}
            </span>
            <span
              className={
                usage.warning ? 'text-destructive' : 'text-muted-foreground'
              }
            >
              {usage.percent_used}%
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/60"
            role="progressbar"
            aria-valuenow={usage.percent_used}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('documents.usage')}
          >
            <div
              className={`h-full rounded-full transition-all ${
                usage.warning ? 'bg-destructive' : 'bg-primary'
              }`}
              style={{ width: `${Math.min(usage.percent_used, 100)}%` }}
            />
          </div>
          {usage.warning && (
            <p className="mt-1.5 text-xs text-destructive">
              {t('documents.nearlyFull')}
            </p>
          )}
        </div>
      )}

      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void handleUpload(e.target.files)}
      />
      <Button
        variant="secondary"
        onClick={() => input.current?.click()}
        isDisabled={busy === 'upload'}
        isLoading={busy === 'upload'}
        icon={<Upload className="h-4 w-4" aria-hidden="true" />}
        className="mb-4"
      >
        {t('documents.upload')}
      </Button>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {t('common.loading')}
        </p>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('documents.empty')}</p>
      ) : (
        <ul className="list-none space-y-1 p-0" aria-label={t('documents.title')}>
          {files.map((file) => (
            <li
              key={file.path}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <button
                type="button"
                onClick={() => setOpen(file.path)}
                aria-label={t('documents.view', { name: file.path })}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <FileSpreadsheet
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="truncate font-mono text-sm text-foreground">
                  {file.path}
                </span>
              </button>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {formatBytes(file.bytes)}
                </span>
                <button
                  type="button"
                  onClick={() => void handleDelete(file.path)}
                  disabled={busy === `delete:${file.path}`}
                  aria-label={t('documents.remove', { name: file.path })}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-destructive disabled:opacity-50"
                >
                  {busy === `delete:${file.path}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <DocumentViewer
          path={open}
          onClose={() => setOpen(null)}
          onSaved={() => void refresh()}
        />
      )}
    </div>
  );
}
