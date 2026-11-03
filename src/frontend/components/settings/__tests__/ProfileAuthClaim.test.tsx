import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { ProfileSection } from '../ProfileSection';
import configReducer from '../../../redux/slices/config';
import chatsReducer from '../../../redux/slices/chats';
import userSettingsReducer from '../../../redux/slices/userSettings';
import toastsReducer from '../../../redux/slices/toasts';

/**
 * The identity panel makes a security claim under a shield icon. It
 * used to make it unconditionally — including on a cluster with
 * authentication switched off, where the name above it is a
 * development stand-in and nothing has been authenticated.
 */
function renderWith(authEnabled: boolean | undefined) {
  const store = configureStore({
    reducer: {
      config: configReducer,
      chats: chatsReducer,
      userSettings: userSettingsReducer,
      toasts: toastsReducer,
    },
    preloadedState: {
      config: {
        branding: {},
        features: authEnabled === undefined ? {} : { auth_enabled: authEnabled },
        content: {},
        status: 'succeeded',
employee: undefined,
      } as never,
    },
  });
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <ProfileSection />
      </Provider>
    </MemoryRouter>,
  );
}

describe('ProfileSection — the authentication claim', () => {
  it('claims SSO when authentication is on', () => {
    renderWith(true);
    expect(screen.getByText(/authenticated via sso/i)).toBeInTheDocument();
  });

  it('says so when authentication is off, rather than claiming SSO', () => {
    renderWith(false);
    expect(screen.queryByText(/authenticated via sso/i)).not.toBeInTheDocument();
    expect(screen.getByText(/authentication is off/i)).toBeInTheDocument();
  });

  it('assumes authentication is on when the flag is absent', () => {
    // An older config must not make a deployed agent claim it is
    // unauthenticated.
    renderWith(undefined);
    expect(screen.getByText(/authenticated via sso/i)).toBeInTheDocument();
  });
});
