import type { HTMLAttributes, ReactNode } from 'react';
import './chat-bubble.css';

export type ChatBubbleRole = 'user' | 'assistant';

export interface ChatBubbleProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'children'> {
  /** Who sent the message; picks the bubble side and colours. */
  role: ChatBubbleRole;
  /** Optional avatar shown beside the bubble. */
  avatar?: ReactNode;
  /** Message actions (copy, edit, feedback); faded until hover/focus. */
  actions?: ReactNode;
  /** Extra content under the actions that must stay fully opaque (comment box, timing). */
  footer?: ReactNode;
  /** Let the bubble span the full transcript width (tool cards, sub-agents, edit mode). */
  wide?: boolean;
  /** ARIA role for the root element (`role` is taken by the sender). */
  htmlRole?: HTMLAttributes<HTMLDivElement>['role'];
  children: ReactNode;
}

/** One chat message in the portal help-drawer bubble style. */
export function ChatBubble({
  role,
  avatar,
  actions,
  footer,
  wide = false,
  htmlRole,
  className,
  children,
  ...rest
}: ChatBubbleProps) {
  const classes = [
    'chat-bubble',
    role === 'user' ? 'chat-bubble--user' : 'chat-bubble--bot',
    wide ? 'chat-bubble--wide' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <div {...rest} role={htmlRole} className={classes}>
      {avatar != null && (
        <span className="chat-bubble-avatar" aria-hidden="true">
          {avatar}
        </span>
      )}
      <div className="chat-bubble-col">
        <div className="chat-bubble-content">{children}</div>
        {actions != null && <div className="chat-bubble-actions">{actions}</div>}
        {footer}
      </div>
    </div>
  );
}
