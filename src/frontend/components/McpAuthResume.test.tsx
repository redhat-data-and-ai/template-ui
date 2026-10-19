import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import type { Message } from '@langchain/langgraph-sdk';

vi.mock('../services/mcp-oauth-api', () => ({
  openMcpOAuthPopup: vi.fn(),
  startMcpOAuthConnect: vi.fn(),
  verifyMcpOAuthConnected: vi.fn(),
}));

import { ChatMessagesView } from './ChatMessagesView';
import chatsReducer from '../redux/slices/chats';
import configReducer from '../redux/slices/config';
import personalizationReducer from '../redux/slices/personalization';
import toastsReducer from '../redux/slices/toasts';
import userSettingsReducer from '../redux/slices/userSettings';
import projectsReducer from '../redux/slices/projects';
import {
  openMcpOAuthPopup,
  startMcpOAuthConnect,
  verifyMcpOAuthConnected,
} from '../services/mcp-oauth-api';

Element.prototype.scrollIntoView = vi.fn();

const QUESTION = 'Use dataverse mcp, who is my manager?';

const MESSAGES = [
  { type: 'human', content: QUESTION, id: 'h1' },
  {
    type: 'ai',
    id: 'a1',
    content: 'Dataverse is not connected.',
    tool_calls: [],
    additional_kwargs: {
      auth_required: [{ mcp_name: 'dataverse', reason: 'not_connected' }],
    },
  },
] as unknown as Message[];

function renderView(onSubmit: () => void) {
  const store = configureStore({
    reducer: {
      chats: chatsReducer,
      config: configReducer,
      personalization: personalizationReducer,
      toasts: toastsReducer,
      userSettings: userSettingsReducer,
      projects: projectsReducer,
    },
  });
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <ChatMessagesView
          messages={MESSAGES}
          isLoading={false}
          pendingInterrupt={undefined as never}
          scrollAreaRef={React.createRef<HTMLDivElement>()}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
          liveActivityEvents={[]}
          historicalActivities={{}}
          chatId="c1"
          traceId={null}
        />
      </Provider>
    </MemoryRouter>,
  );
}

describe('connecting an MCP resumes the question', () => {
  beforeEach(() => {
    vi.mocked(verifyMcpOAuthConnected).mockReset().mockResolvedValue(false);
    vi.mocked(startMcpOAuthConnect)
      .mockReset()
      .mockResolvedValue({ authorize_url: 'https://idp.example/auth' } as never);
    vi.mocked(openMcpOAuthPopup)
      .mockReset()
      .mockReturnValue({ popup: { closed: true } } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-sends the original question once the integration connects', async () => {
    const onSubmit = vi.fn();
    renderView(onSubmit);

    const button = await screen.findByRole('button', { name: /connect/i });

    // The OAuth popup has closed and the server now says connected.
    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(true);
    button.click();

    await waitFor(() => expect(startMcpOAuthConnect).toHaveBeenCalledWith('dataverse'));

    // The component polls the popup every 500ms.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(QUESTION));
  });
});
