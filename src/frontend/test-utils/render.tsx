import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import type { RenderOptions } from '@testing-library/react';
import { render } from '@testing-library/react';
import { createTestStore } from './createTestStore';

interface WrapperProps {
  children: React.ReactNode;
}

let preloaded: Record<string, unknown> | undefined;

function AllProviders({ children }: WrapperProps) {
  const store = createTestStore(preloaded);
  return (
    <Provider store={store}>
      <MemoryRouter>{children}</MemoryRouter>
    </Provider>
  );
}

function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { preloadedState?: Record<string, unknown> },
) {
  const { preloadedState, ...rest } = options ?? {};
  preloaded = preloadedState;
  try {
    return render(ui, { wrapper: AllProviders, ...rest });
  } finally {
    preloaded = undefined;
  }
}

export { renderWithProviders };
