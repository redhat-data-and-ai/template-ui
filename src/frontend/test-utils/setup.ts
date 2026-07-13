import '@testing-library/jest-dom';
import { expect } from 'vitest';
import { configureAxe, toHaveNoViolations } from 'jest-axe';

// Extend vitest expect with jest-axe matchers
expect.extend(toHaveNoViolations);

// Configure axe with WCAG 2.1 AA rules
// Disable color-contrast: jsdom cannot compute computed styles
export const axe = configureAxe({
  rules: {
    'color-contrast': { enabled: false },
  },
});

// Mock window.APP_DATA and window.USER_DATA for all tests
Object.defineProperty(window, 'APP_DATA', {
  value: {
    agentName: 'TestAgent',
    basePath: '/',
  },
  writable: true,
  configurable: true,
});

Object.defineProperty(window, 'USER_DATA', {
  value: {
    displayName: 'Test User',
    given_name: 'Test',
    email: 'test@example.com',
  },
  writable: true,
  configurable: true,
});
