import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import configReducer, { setContent } from '../redux/slices/config';
import { useContent } from './useContent';
import type { ContentConfig } from '../services/config.service';

const CONFIG: ContentConfig = {
  greeting: 'Hey {user}!',
  greeting_anonymous: 'Hey there!',
  subtitle: '{agent} is ready.',
  quick_prompts_heading: 'Try one',
  quick_prompts: ['What can {agent} do?', 'Plain prompt'],
  input_placeholder: 'Ask {agent}...',
  welcome_heading: 'Welcome to {agent}!',
  welcome_subtitle: 'How can I help?',
};

function render(content: ContentConfig | null) {
  const store = configureStore({ reducer: { config: configReducer } });
  if (content) store.dispatch(setContent(content));
  return renderHook(() => useContent(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  }).result.current;
}

describe('useContent', () => {
  beforeEach(() => {
    window.APP_DATA = { agentName: 'Atlas' } as typeof window.APP_DATA;
    window.USER_DATA = undefined;
  });

  it('substitutes {agent} everywhere it appears', () => {
    const c = render(CONFIG);
    expect(c.subtitle).toBe('Atlas is ready.');
    expect(c.quick_prompts).toEqual(['What can Atlas do?', 'Plain prompt']);
    expect(c.welcome_heading).toBe('Welcome to Atlas!');
  });

  it('picks the anonymous greeting when no user is signed in', () => {
    expect(render(CONFIG).resolved_greeting).toBe('Hey there!');
  });

  it('picks the named greeting once a user is present', () => {
    window.USER_DATA = { displayName: 'Sam' } as typeof window.USER_DATA;
    expect(render(CONFIG).resolved_greeting).toBe('Hey Sam!');
  });

  it('falls back to built-in copy before the config loads', () => {
    expect(render(null).welcome_subtitle).toBe('How can I help you today?');
  });
});
