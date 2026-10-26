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

describe('chatStorage — deletion intent survives a reload', () => {
  beforeEach(() => localStorage.clear());

  it('remembers what was meant to be deleted', () => {
    chatStorage.saveDeletedThreadIds(['t-1', 't-2']);
    expect(chatStorage.loadDeletedThreadIds()).toEqual(['t-1', 't-2']);
  });

  it('returns nothing when there is no pending sweep', () => {
    expect(chatStorage.loadDeletedThreadIds()).toEqual([]);
  });

  it('forgets once the sweep has finished', () => {
    chatStorage.saveDeletedThreadIds(['t-1']);
    chatStorage.clearDeletedThreadIds();
    expect(chatStorage.loadDeletedThreadIds()).toEqual([]);
  });

  it('survives a corrupted entry rather than throwing', () => {
    // The real key, via the same scoping helper — writing a bare
    // key would make this pass by reading nothing at all.
    chatStorage.saveDeletedThreadIds(['t-1']);
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith('dataverse-ai-deleted-threads'),
    );
    expect(key).toBeDefined();
    localStorage.setItem(key as string, '{not json');

    expect(chatStorage.loadDeletedThreadIds()).toEqual([]);
  });
})
