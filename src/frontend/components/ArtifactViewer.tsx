import { useState } from 'react';
import { Button, Label } from '@patternfly/react-core';
import { Copy, Check, FileText, Code, FileJson } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { detectArtifactKind, type ArtifactKind } from '../types/deep-agent';

interface ArtifactViewerProps {
  readonly content: string;
  readonly title?: string;
}

const KIND_META: Record<ArtifactKind, { label: string; color: 'blue' | 'purple' | 'orange' | 'grey'; icon: typeof FileText }> = {
  code: { label: 'Code', color: 'purple', icon: Code },
  json: { label: 'JSON', color: 'orange', icon: FileJson },
  markdown: { label: 'Markdown', color: 'blue', icon: FileText },
  text: { label: 'Text', color: 'grey', icon: FileText },
};

export function ArtifactViewer({ content, title }: ArtifactViewerProps) {
  const [copied, setCopied] = useState(false);
  const kind = detectArtifactKind(content);
  const meta = KIND_META[kind];
  const KindIcon = meta.icon;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable (e.g. non-secure context) */
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <KindIcon className="w-3.5 h-3.5 text-muted-foreground" />
          {title && <span className="text-xs font-medium text-foreground">{title}</span>}
          <Label isCompact color={meta.color}>{meta.label}</Label>
        </div>
        <Button
          variant="plain"
          size="sm"
          className="p-1!"
          onClick={handleCopy}
          aria-label="Copy content"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
      </div>

      <div className="max-h-80 overflow-auto p-3">
        {kind === 'markdown' ? (
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : kind === 'json' ? (
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
            {(() => { try { return JSON.stringify(JSON.parse(content), null, 2); } catch { return content; } })()}
          </pre>
        ) : (
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">{content}</pre>
        )}
      </div>
    </div>
  );
}
