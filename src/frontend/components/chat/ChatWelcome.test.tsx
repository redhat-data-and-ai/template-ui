import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatWelcome } from './ChatWelcome';

const prompts = ['One', 'Two', 'Three', 'Four'];

describe('ChatWelcome', () => {
  it('renders the greeting and description', () => {
    render(<ChatWelcome userName="Ada" agentTitle="Bot" prompts={prompts} onPrompt={vi.fn()} />);
    expect(screen.getByText('Hey Ada!')).toBeInTheDocument();
    expect(screen.getByText('Bot').tagName).toBe('B');
    expect(screen.getByText(/is ready to help\. What would you like to explore today\?/)).toBeInTheDocument();
    expect(screen.getByText(/Let's try some quick prompts/)).toBeInTheDocument();
  });

  it('renders one button per prompt', () => {
    render(<ChatWelcome userName="Ada" agentTitle="Bot" prompts={prompts} onPrompt={vi.fn()} />);
    for (const p of prompts) {
      expect(screen.getByRole('button', { name: `Start chat: ${p}` })).toBeInTheDocument();
    }
  });

  it('calls onPrompt with the prompt text on click', async () => {
    const onPrompt = vi.fn();
    render(<ChatWelcome userName="Ada" agentTitle="Bot" prompts={prompts} onPrompt={onPrompt} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start chat: Two' }));
    expect(onPrompt).toHaveBeenCalledWith('Two');
  });
});
