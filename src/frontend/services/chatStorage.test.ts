import { describe, it, expect, beforeEach } from 'vitest';
import { chatStorage } from './chatStorage';

describe('chatStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not persist in-flight assign rollback state', () => {
    chatStorage.saveChats([
      {
        id: 'c1',
        title: 'Chat',
        preview: '',
        messages: [],
        project_id: 'p1',
        ...({ _prevProjectId: null } as { _prevProjectId: null }),
      },
    ]);

    const raw = JSON.parse(localStorage.getItem('dataverse-ai-chats') ?? '[]');
    expect(raw[0]._prevProjectId).toBeUndefined();
    expect(chatStorage.loadChats()[0]).not.toHaveProperty('_prevProjectId');
  });

  it('strips _prevProjectId from chats already in localStorage', () => {
    localStorage.setItem(
      'dataverse-ai-chats',
      JSON.stringify([
        {
          id: 'c1',
          title: 'Chat',
          preview: '',
          messages: [],
          project_id: 'p1',
          _prevProjectId: null,
        },
      ]),
    );
    expect(chatStorage.loadChats()[0]).not.toHaveProperty('_prevProjectId');
  });
});
