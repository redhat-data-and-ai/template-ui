import { configureStore } from '@reduxjs/toolkit';
import chatsReducer from './slices/chats';
import userSettingsReducer from './slices/userSettings';

export const store = configureStore({
  reducer: {
    chats: chatsReducer,
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
