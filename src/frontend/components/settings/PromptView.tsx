import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@patternfly/react-core';
import { FileText } from 'lucide-react';
import { SkillSource } from './SkillSource';

/**
 * The orchestrator's prompt — its identity, routing table and rules.
 *
 * A single document rather than a list, so there is nothing to
 * browse: one button opens the same read-only viewer the skills and
 * subagents use, with frontmatter split from the prose.
 *
 * Worth exposing for the same reason as skills: someone deciding
 * whether to trust a routing decision needs to read the rules the
 * agent was following.
 */
export function PromptView() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        {t('prompt.description')}
      </p>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        icon={<FileText className="h-4 w-4" aria-hidden="true" />}
      >
        {t('prompt.view')}
      </Button>
      {open && (
        <SkillSource
          name="PROMPT.md"
          endpoint="/prompt"
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
