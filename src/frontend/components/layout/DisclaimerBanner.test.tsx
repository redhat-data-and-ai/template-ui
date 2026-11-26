import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DisclaimerBanner } from './DisclaimerBanner';

describe('DisclaimerBanner', () => {
  it('renders the default text', () => {
    render(<DisclaimerBanner />);
    expect(
      screen.getByText(
        'You are interacting with an AI tool. Always review AI-generated content prior to use.',
      ),
    ).toBeInTheDocument();
  });

  it('renders custom text', () => {
    render(<DisclaimerBanner text="Custom notice" />);
    expect(screen.getByText('Custom notice')).toBeInTheDocument();
  });
});
