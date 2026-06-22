import { configureStore } from '@reduxjs/toolkit';
import chatsReducer from './slices/chats';
import configReducer from './slices/config';
import personalizationReducer from './slices/personalization';
import toastsReducer from './slices/toasts';
import userSettingsReducer from './slices/userSettings';

export const store = configureStore({
  reducer: {
    chats: chatsReducer,
    config: configReducer,
    personalization: personalizationReducer,
    toasts: toastsReducer,
    userSettings: userSettingsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredPaths: ['chats.chats'],
        ignoredActions: ['chats/addChat', 'chats/updateChat', 'chats/setChats'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
