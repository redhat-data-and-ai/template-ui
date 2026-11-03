import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core';
import { Loader2 } from 'lucide-react';
import { readDocument, writeDocument } from '../../services/documents-api';

/**
 * View and edit one document.
 *
 * Editable, unlike the skill viewer — a skill is config that deploys
 * from git, whereas a dataset lives only on this volume and there is
 * nowhere else to correct a bad row.
 *
 * A truncated file is read-only. Saving back a prefix would write it
 * over the whole file and silently discard the rest, which is the
 * kind of data loss that is noticed much later.
 */
export function DocumentViewer({
  path,
  onClose,
  onSaved,
}: {
  path: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [editable, setEditable] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const file = await readDocument(path);
        if (cancelled) return;
        setContent(file.content);
        setOriginal(file.content);
        setEditable(file.editable);
        setTruncated(file.truncated);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not read');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const dirty = content !== original;

  const save = async () => {
    setSaving(true);
    try {
      await writeDocument(path, content);
      setOriginal(content);
      onSaved();
      onClose();
    } catch (e) {
      // Most often a 507 naming the limit, which is the useful part.
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen variant="large" onClose={onClose} aria-label={path}>
      <ModalHeader title={path} />
      <ModalBody>
        {error && <Alert variant="danger" isInline title={error} className="mb-3" />}
        {truncated && (
          <Alert
            variant="warning"
            isInline
            title={t('documents.truncated')}
            className="mb-3"
          />
        )}
        {loading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t('common.loading')}
          </p>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            readOnly={!editable}
            spellCheck={false}
            aria-label={t('documents.content', { name: path })}
            className="w-full rounded-lg border border-border bg-card p-3 font-mono text-xs leading-relaxed text-foreground focus:outline-none"
            style={{ minHeight: '24rem' }}
          />
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={() => void save()}
          isDisabled={!editable || !dirty || saving}
          isLoading={saving}
        >
          {t('common.save')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
