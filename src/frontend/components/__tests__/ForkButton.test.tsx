import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ForkButton } from '../ForkButton';
import * as api from '../../services/fork-api';
import chatsReducer from '../../redux/slices/chats';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

// The button now registers the fork in the store before navigating,
// so it needs a real one.
function renderButton(props: Partial<React.ComponentProps<typeof ForkButton>> = {}) {
  const store = configureStore({ reducer: { chats: chatsReducer } });
  const view = render(
    <Provider store={store}>
      <MemoryRouter>
        <ForkButton chatId="t1" messageIndex={2} {...props} />
      </MemoryRouter>
    </Provider>,
  );
  return { ...view, store };
}

describe('ForkButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forks at the given message and navigates to the new thread', async () => {
    const spy = vi.spyOn(api, 'forkThread').mockResolvedValue({
      thread_id: 'new-thread',
      forked_from: 't1',
      message_count: 2,
    });

    renderButton();
    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(spy).toHaveBeenCalledWith('t1', 2));
    expect(navigate).toHaveBeenCalledWith('/chat/new-thread');
  });

  it('notifies the caller so the sidebar can show the fork', async () => {
    vi.spyOn(api, 'forkThread').mockResolvedValue({
      thread_id: 'new-thread',
      forked_from: 't1',
      message_count: 2,
    });
    const onForked = vi.fn();

    renderButton({ onForked });
    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(onForked).toHaveBeenCalledWith('new-thread'));
  });

  it('does not navigate when the fork fails', async () => {
    vi.spyOn(api, 'forkThread').mockRejectedValue(new Error('boom'));

    renderButton();
    await userEvent.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute(
        'title',
        expect.stringContaining('try again'),
      ),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stays clickable after a failure, since nothing was created', async () => {
    vi.spyOn(api, 'forkThread').mockRejectedValue(new Error('boom'));

    renderButton();
    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled());
  });

  it('has an accessible name describing what it does', () => {
    renderButton();
    expect(
      screen.getByRole('button', { name: /branch a new conversation/i }),
    ).toBeInTheDocument();
  });
});

describe('ForkButton registers the fork', () => {
  it('adds the new thread to the store before navigating', async () => {
    // The server creates the thread, but the sidebar is driven by the
    // store. Navigating to an id it has never seen lands on an empty
    // page with no entry in the list, which reads as the button
    // having done nothing.
    vi.spyOn(api, 'forkThread').mockResolvedValue({
      thread_id: 'new-thread',
      forked_from: 't1',
      message_count: 2,
    });
    const { store } = renderButton();
    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      const ids = (store.getState().chats.chats ?? []).map(
        (c: { id: string }) => c.id,
      );
      expect(ids).toContain('new-thread');
    });
    expect(navigate).toHaveBeenCalledWith('/chat/new-thread');
  });
});
