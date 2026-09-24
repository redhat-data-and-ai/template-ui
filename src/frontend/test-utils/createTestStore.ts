import { configureStore } from '@reduxjs/toolkit';
import chatsReducer from '../redux/slices/chats';
import configReducer from '../redux/slices/config';
import personalizationReducer from '../redux/slices/personalization';
import toastsReducer from '../redux/slices/toasts';
import userSettingsReducer from '../redux/slices/userSettings';
import projectsReducer from '../redux/slices/projects';

export function createTestStore() {
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
