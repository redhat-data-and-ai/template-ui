import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils/render';
import { HomePage } from './HomePage';

afterEach(() => {
  window.APP_DATA = {
    agentName: 'TestAgent',
    basePath: '/',
    apiUrl: '',
    refreshableToken: '',
  };
});

describe('HomePage quick prompts', () => {
  it('shows the built-in prompts when quick prompts are empty', () => {
    window.APP_DATA = {
      agentName: 'TestAgent',
      basePath: '/',
      apiUrl: '',
      refreshableToken: '',
      quickPrompts: [],
    };

    renderWithProviders(<HomePage />);

    expect(screen.getByRole('button', { name: 'Start chat: What can you do for me?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start chat: Help me analyze a dataset' })).toBeInTheDocument();
  });

  it('never interpolates the agent name into a built-in prompt', () => {
    window.APP_DATA = {
      agentName: 'test0511261',
      basePath: '/',
      apiUrl: '',
      refreshableToken: '',
      quickPrompts: [],
    };

    renderWithProviders(<HomePage />);

    // The agent name is free-form and is sent verbatim to the model as a user
    // message. A data agent reads an unfamiliar identifier as a row to look up
    // and answers "that user does not exist" instead of describing itself.
    expect(screen.queryByRole('button', { name: /test0511261/ })).not.toBeInTheDocument();
  });

  it('shows settings.yaml prompts when quick prompts are set', () => {
    window.APP_DATA = {
      agentName: 'TestAgent',
      basePath: '/',
      apiUrl: '',
      refreshableToken: '',
      quickPrompts: ['What is our refund policy?', 'Summarize the latest incident'],
    };

    renderWithProviders(<HomePage />);

    expect(screen.getByRole('button', { name: 'Start chat: What is our refund policy?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start chat: Summarize the latest incident' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Help me analyze a dataset/i })).not.toBeInTheDocument();
  });
});
