import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { Message } from '@langchain/langgraph-sdk';
import { ChatMessagesView } from './ChatMessagesView';
import chatsReducer from '../redux/slices/chats';
import configReducer from '../redux/slices/config';
import personalizationReducer from '../redux/slices/personalization';
import toastsReducer from '../redux/slices/toasts';
import userSettingsReducer from '../redux/slices/userSettings';
import projectsReducer from '../redux/slices/projects';

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// ── Store factory ─────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: {
      chats: chatsReducer,
      config: configReducer,
      personalization: personalizationReducer,
      toasts: toastsReducer,
      userSettings: userSettingsReducer,
      projects: projectsReducer,
    },
  });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const HUMAN_MESSAGE = {
  type: 'human',
  content: 'Hello agent',
  id: 'msg-human-1',
} as unknown as Message;

function makeBaseProps(overrides: Record<string, unknown> = {}) {
  return {
    messages: [HUMAN_MESSAGE],
    isLoading: false,
    pendingInterrupts: [],
    scrollAreaRef: React.createRef<HTMLDivElement>(),
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    liveActivityEvents: [] as any[],
    historicalActivities: {} as Record<string, any[]>,
    chatId: 'test-chat',
    traceId: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatMessagesView — errorMessage prop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders actual error text when errorMessage is provided', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({ errorMessage: 'Model configuration is invalid' })}
        />
      </Provider>,
    );

    // showNoResponse has a 1500ms delay before rendering
    act(() => { vi.advanceTimersByTime(2000); });

    expect(screen.getByText('The agent encountered an error:')).toBeInTheDocument();
    expect(screen.getByText('Model configuration is invalid')).toBeInTheDocument();
  });

  it('shows generic fallback when errorMessage is not provided', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <ChatMessagesView {...makeBaseProps()} />
      </Provider>,
    );

    act(() => { vi.advanceTimersByTime(2000); });

    expect(
      screen.getByText("The agent didn\u0027t respond. This could be a temporary issue."),
    ).toBeInTheDocument();
  });

  it('shows generic fallback when errorMessage is null', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <ChatMessagesView {...makeBaseProps({ errorMessage: null })} />
      </Provider>,
    );

    act(() => { vi.advanceTimersByTime(2000); });

    expect(
      screen.getByText("The agent didn\u0027t respond. This could be a temporary issue."),
    ).toBeInTheDocument();
  });

  it('renders error when last message is AI (partial response before error)', () => {
    const store = makeStore();
    const AI_MESSAGE = {
      type: 'ai',
      content: 'Partial response...',
      id: 'msg-ai-1',
      tool_calls: [],
    } as unknown as Message;

    render(
      <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({
            messages: [HUMAN_MESSAGE, AI_MESSAGE],
            errorMessage: 'Model configuration is invalid',
          })}
        />
      </Provider>,
    );

    // No delay needed — the standalone error block renders immediately
    expect(screen.getByText('The agent encountered an error:')).toBeInTheDocument();
    expect(screen.getByText('Model configuration is invalid')).toBeInTheDocument();
  });

  it('does not render standalone error block while loading', () => {
    const store = makeStore();
    const AI_MESSAGE = {
      type: 'ai',
      content: 'Partial response...',
      id: 'msg-ai-2',
      tool_calls: [],
    } as unknown as Message;

    render(
      <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({
            messages: [HUMAN_MESSAGE, AI_MESSAGE],
            isLoading: true,
            errorMessage: 'Some error',
          })}
        />
      </Provider>,
    );

    expect(screen.queryByText('The agent encountered an error:')).not.toBeInTheDocument();
  });

  it('does not render error block while loading', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({ isLoading: true, errorMessage: 'Some error' })}
        />
      </Provider>,
    );

    act(() => { vi.advanceTimersByTime(2000); });

    expect(screen.queryByText('The agent encountered an error:')).not.toBeInTheDocument();
    expect(screen.queryByText('Some error')).not.toBeInTheDocument();
  });
});


describe('ChatMessagesView — explicit interrupt ownership', () => {
  it('renders subagent tool approval without a matching parent tool call and removes it when resolved', () => {
    const onResume = vi.fn();
    const store = makeStore();
    const message = { type: 'ai', id: 'parent', content: '', tool_calls: [
      { id: 'task', name: 'task', args: { subagent_type: 'researcher' } },
    ] } as unknown as Message;
    const interrupt = { id: 'inner', resumable: true, value: {
      action_requests: [{ name: 'lookup_records', args: { query: 'example' } }], review_configs: [],
    } };
    const props = makeBaseProps({ messages: [message], pendingInterrupts: [interrupt], onInterruptResume: onResume });
    const { rerender } = render(<Provider store={store}><ChatMessagesView {...props} /></Provider>);
    expect(screen.getAllByRole('button', { name: /^Approve/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
    expect(onResume).toHaveBeenCalledExactlyOnceWith([{ type: 'approve' }], 'inner');
    rerender(<Provider store={store}><ChatMessagesView {...props} pendingInterrupts={[]} /></Provider>);
    expect(screen.queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument();
  });

  it('submits the owning ID for identical tool names with different arguments', () => {
    const onResume=vi.fn();
    const a={id:'a',resumable:true,value:{action_requests:[{name:'same_tool',args:{target:'A'}}],review_configs:[]}};
    const b={id:'b',resumable:true,value:{action_requests:[{name:'same_tool',args:{target:'B'}}],review_configs:[]}};
    const message={type:'ai',id:'m1',content:'',tool_calls:[{id:'tc-a',name:'same_tool',args:{target:'A'}},{id:'tc-b',name:'same_tool',args:{target:'B'}}]} as unknown as Message;
    const {container}=render(<Provider store={makeStore()}><ChatMessagesView {...makeBaseProps({messages:[message],pendingInterrupts:[a,b],onInterruptResume:onResume})}/></Provider>);
    expect(screen.getAllByRole('button',{name:/^Approve/})).toHaveLength(2);
    const cardB=container.querySelector('[data-interrupt-id="b"]')!;
    expect(cardB.textContent).toContain('"target": "B"');
    fireEvent.click(within(cardB as HTMLElement).getByRole('button',{name:/^Approve/}));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledWith([{type:'approve'}],'b');
    expect(container.querySelector('[data-interrupt-id="a"]')?.textContent).toContain('"target": "A"');
  });

  it('keeps ambiguous identical tool calls separate from their exact approval request', () => {
    const onResume = vi.fn();
    const message = { type: 'ai', id: 'm', content: '', tool_calls: [
      { id: 'first', name: 'write_file', args: { file_path: '/hi.txt', content: 'hi' } },
      { id: 'second', name: 'write_file', args: { file_path: '/hi.txt', content: 'hi' } },
    ] } as unknown as Message;
    const interrupt = { id: 'owner', resumable: true, value: {
      action_requests: [{ name: 'write_file', args: { content: 'hi', file_path: '/hi.txt' } }], review_configs: [],
    } };
    const { container } = render(<Provider store={makeStore()}><ChatMessagesView {...makeBaseProps({
      messages: [message], pendingInterrupts: [interrupt], onInterruptResume: onResume,
    })}/></Provider>);
    expect(screen.getAllByRole('button', { name: /^Approve/ })).toHaveLength(1);
    const card = container.querySelector('[data-interrupt-id="owner"]') as HTMLElement;
    expect(within(card).getByText('Arguments')).toBeVisible();
    expect(card).toHaveTextContent('/hi.txt');
    fireEvent.click(within(card).getByRole('button', { name: /^Approve/ }));
    expect(onResume).toHaveBeenCalledExactlyOnceWith([{ type: 'approve' }], 'owner');
  });

  it('does not create a second tool card when its result arrives before resume ends', () => {
    const onResume = vi.fn(() => new Promise<void>(() => {}));
    const message = { type: 'ai', id: 'write', content: '', tool_calls: [
      { id: 'call-write', name: 'write_file', args: { file_path: '/hi.txt', content: 'hi' } },
    ] } as unknown as Message;
    const interrupt = { id: 'write-approval', resumable: true, value: {
      action_requests: [{ name: 'write_file', args: { content: 'hi', file_path: '/hi.txt' } }], review_configs: [],
    } };
    const props = makeBaseProps({ messages: [message], pendingInterrupts: [interrupt], onInterruptResume: onResume });
    const store = makeStore();
    const { rerender } = render(<Provider store={store}><ChatMessagesView {...props}/></Provider>);
    fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
    const completed = { ...message, tool_calls: [{ ...message.tool_calls![0], content: 'Successfully wrote /hi.txt' }] } as Message;
    rerender(<Provider store={store}><ChatMessagesView {...props} messages={[completed]} isResuming /></Provider>);
    expect(screen.getAllByText('write_file', { exact: true })).toHaveLength(1);
    expect(screen.queryByText('Waiting...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument();
  });

  it('explains the disabled controls only while another approval is resuming', () => {
    const store = makeStore();
    const interrupt = { id: 'pending', resumable: true, value: {
      action_requests: [{ name: 'write_file', args: { file_path: '/tmp/waiting.txt' } }], review_configs: [],
    } };
    const props = makeBaseProps({ pendingInterrupts: [interrupt], onInterruptResume: vi.fn(), isApprovalBusy: true });
    const { rerender } = render(<Provider store={store}><ChatMessagesView {...props} /></Provider>);
    const message = 'Waiting for the current approval to finish…';
    expect(screen.getByRole('button', { name: /^Approve/ })).toBeDisabled();
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    rerender(<Provider store={store}><ChatMessagesView {...props} isResuming /></Provider>);
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByRole('button', { name: /^Approve/ })).toBeDisabled();
    rerender(<Provider store={store}><ChatMessagesView {...props} isApprovalBusy={false} /></Provider>);
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Approve/ })).toBeEnabled();
  });

  it('keeps multi-action controls disabled until the interrupt stream is idle', () => {
    const onResume=vi.fn();
    const interrupt={id:'a',resumable:true,value:{action_requests:[{name:'tool1',args:{}},{name:'tool2',args:{}}],review_configs:[]}};
    const store=makeStore();
    const props=makeBaseProps({pendingInterrupts:[interrupt],onInterruptResume:onResume,isLoading:true,isApprovalBusy:true});
    const {rerender}=render(<Provider store={store}><ChatMessagesView {...props}/></Provider>);
    const buttons=screen.getAllByRole('button',{name:/^Approve/});
    buttons.forEach(button=>{expect(button).toBeDisabled();fireEvent.click(button);});
    expect(onResume).not.toHaveBeenCalled();
    rerender(<Provider store={store}><ChatMessagesView {...props} isApprovalBusy={false}/></Provider>);
    screen.getAllByRole('button',{name:/^Approve/}).forEach(button=>fireEvent.click(button));
    expect(onResume).toHaveBeenCalledWith([{type:'approve'},{type:'approve'}],'a');
  });
});
