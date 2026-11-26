import { useState } from 'react';
import { Button, Card, Label } from '@patternfly/react-core';
import type { ComponentType } from 'react';
import { CheckIcon, CodeIcon, CopyIcon, FileAltIcon } from '@patternfly/react-icons';
import type { SVGIconProps } from '@patternfly/react-icons/dist/esm/createIcon';
import './rich-content.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { markdownSanitizeSchema } from '../lib/markdown-sanitize';
import { detectArtifactKind, type ArtifactKind } from '../types/deep-agent';

interface ArtifactViewerProps {
  readonly content: string;
  readonly title?: string;
}

const KIND_META: Record<ArtifactKind, { label: string; color: 'blue' | 'purple' | 'orange' | 'grey'; icon: ComponentType<SVGIconProps> }> = {
  code: { label: 'Code', color: 'purple', icon: CodeIcon },
  json: { label: 'JSON', color: 'orange', icon: CodeIcon },
  markdown: { label: 'Markdown', color: 'blue', icon: FileAltIcon },
  text: { label: 'Text', color: 'grey', icon: FileAltIcon },
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
    <Card isCompact className="app-artifact">
      <div className="app-artifact__header">
        <div className="app-artifact__title">
          <KindIcon aria-hidden="true" />
          {title && <span className="app-artifact__name">{title}</span>}
          <Label isCompact color={meta.color}>{meta.label}</Label>
        </div>
        <Button
          variant="plain"
          size="sm"
          onClick={handleCopy}
          aria-label="Copy content"
          icon={copied ? <CheckIcon /> : <CopyIcon />}
        />
      </div>

      <div className="app-artifact__body">
        {kind === 'markdown' ? (
          <div className="app-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema]]}>{content}</ReactMarkdown>
          </div>
        ) : kind === 'json' ? (
          <pre>
            {(() => { try { return JSON.stringify(JSON.parse(content), null, 2); } catch { return content; } })()}
          </pre>
        ) : (
          <pre>{content}</pre>
        )}
      </div>
    </Card>
  );
}
