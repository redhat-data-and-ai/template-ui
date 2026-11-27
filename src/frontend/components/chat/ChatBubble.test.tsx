import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatBubble } from './ChatBubble';

describe('ChatBubble', () => {
  it('marks user bubbles with chat-bubble--user', () => {
    const { container } = render(<ChatBubble role="user">Hi</ChatBubble>);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('chat-bubble', 'chat-bubble--user');
    expect(root).not.toHaveClass('chat-bubble--bot');
    expect(root.querySelector('.chat-bubble-content')).toHaveTextContent('Hi');
  });

  it('marks assistant bubbles with chat-bubble--bot', () => {
    const { container } = render(<ChatBubble role="assistant">Hello</ChatBubble>);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('chat-bubble', 'chat-bubble--bot');
    expect(root).not.toHaveClass('chat-bubble--user');
  });

  it('renders the avatar and actions slots when given', () => {
    const { container } = render(
      <ChatBubble role="assistant" avatar={<span>A</span>} actions={<button type="button">Copy message</button>}>
        Body
      </ChatBubble>,
    );
    expect(container.querySelector('.chat-bubble-avatar')).toHaveTextContent('A');
    const actions = container.querySelector('.chat-bubble-actions') as HTMLElement;
    expect(actions).toContainElement(screen.getByRole('button', { name: 'Copy message' }));
  });

  it('omits the avatar and actions wrappers when not given', () => {
    const { container } = render(<ChatBubble role="user">Body</ChatBubble>);
    expect(container.querySelector('.chat-bubble-avatar')).toBeNull();
    expect(container.querySelector('.chat-bubble-actions')).toBeNull();
  });

  it('passes through role and aria attributes to the root', () => {
    render(<ChatBubble role="assistant" aria-label="Message from assistant" htmlRole="article">x</ChatBubble>);
    expect(screen.getByRole('article', { name: 'Message from assistant' })).toHaveClass('chat-bubble--bot');
  });
});
