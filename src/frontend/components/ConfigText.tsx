import { Fragment, type ReactElement } from 'react';

/** Emoji plus any variation selectors / skin-tone modifiers / ZWJ sequences. */
const EMOJI =
  /(?:\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️)?(?:‍\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️)?)*)+/gu;

/**
 * Renders a string from `config/ui/settings.yaml`, wrapping emoji in
 * `aria-hidden` spans.
 *
 * Copy is author-supplied, so the accessibility of the emoji in it cannot be
 * hand-maintained in JSX the way a literal could be — a screen reader would
 * otherwise read "Hey Sam! waving hand sign".
 */
export function ConfigText({ value }: { value: string }): ReactElement {
  const parts: ReactElement[] = [];
  let cursor = 0;

  for (const match of value.matchAll(EMOJI)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      parts.push(<Fragment key={cursor}>{value.slice(cursor, start)}</Fragment>);
    }
    parts.push(
      <span key={`e${start}`} aria-hidden="true">
        {match[0]}
      </span>,
    );
    cursor = start + match[0].length;
  }

  if (cursor < value.length) {
    parts.push(<Fragment key={cursor}>{value.slice(cursor)}</Fragment>);
  }

  return <>{parts}</>;
}
