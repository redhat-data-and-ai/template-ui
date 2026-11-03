import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test-utils/render';
import { HomePage } from '../HomePage';

/**
 * The home screen is the first thing a new conversation touches, and
 * since documents are only ever attached to a conversation it is also
 * the first place someone tries to hand over a file.
 */
describe('HomePage', () => {
  it('lets you attach a document before sending anything', () => {
    // This was impossible. The home screen hand-rolled its own
    // composer with a bare textarea and no attach button, so the only
    // way to give the agent a file was to send a message first and
    // attach afterwards — on the one screen whose entire job is
    // starting from nothing.
    renderWithProviders(<HomePage />);
    expect(screen.getByRole('button', { name: /attach files/i })).toBeInTheDocument();
  });

  it('attaches to the thread the chat will become', () => {
    // The attach button needs a thread id before the thread exists.
    // Generating one at submit time instead would upload the file to
    // an id the conversation then never uses, and the document would
    // silently not be there.
    renderWithProviders(<HomePage />);
    const attach = screen.getByRole('button', { name: /attach files/i });
    expect(attach).toBeEnabled();
  });

  it('still offers the composer and quick prompts', () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByRole('textbox', { name: /enter a prompt/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
  });
});
