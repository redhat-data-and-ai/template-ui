import { describe, expect, it, vi, beforeEach } from 'vitest';
import { filterSubagents, fetchMentionCatalog, slashHighlightParts, slashTokenAtCaret, applySubagentName, matchingSubagentNames, type SubagentOption } from './subagentSlash';
import { authenticatedFetch } from '../services/authenticated-fetch';

vi.mock('../services/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
}));

vi.mock('../lib/app-paths', () => ({
  buildAgentApiUrl: (path: string) => `/api/proxy/agent${path}`,
}));

const OPTIONS: SubagentOption[] = [
  { name: 'analyst', description: 'BMI' },
  { name: 'analyst-extra', description: 'Longer' },
  { name: 'publisher', description: 'Email' },
  { name: 'asker', description: 'Ask' },
];

describe('slashTokenAtCaret', () => {
  it('detects / at the start of the message', () => {
    expect(slashTokenAtCaret('/', 1)).toEqual({ start: 0, query: '' });
    expect(slashTokenAtCaret('/an', 3)).toEqual({ start: 0, query: 'an' });
  });

  it('detects / at the start of a new word', () => {
    const text = 'please /anal';
    expect(slashTokenAtCaret(text, text.length)).toEqual({
      start: 7,
      query: 'anal',
    });
  });

  it('returns null for path-like foo/bar and urls', () => {
    const text = 'see foo/bar';
    expect(slashTokenAtCaret(text, text.length)).toBeNull();
    expect(slashTokenAtCaret('see https://example.com/analyst', 30)).toBeNull();
  });

  it('returns null after the token ends (space)', () => {
    const text = '/analyst calculate';
    expect(slashTokenAtCaret(text, text.length)).toBeNull();
    expect(slashTokenAtCaret(text, '/analyst '.length)).toBeNull();
  });

  it('returns the query while the caret is inside the token', () => {
    const text = '/analyst';
    expect(slashTokenAtCaret(text, 4)).toEqual({ start: 0, query: 'ana' });
  });

  it('strips trailing punctuation but keeps the token', () => {
    expect(slashTokenAtCaret('/analyst,', 9)).toEqual({ start: 0, query: 'analyst' });
  });

  it('does not open after a parenthesis', () => {
    expect(slashTokenAtCaret('(/asker)', 8)).toBeNull();
  });

  it('allows a hyphen inside the query', () => {
    const text = '/analyst-ex';
    expect(slashTokenAtCaret(text, text.length)).toEqual({
      start: 0,
      query: 'analyst-ex',
    });
  });
});

describe('filterSubagents', () => {
  it('filters by case-insensitive substring', () => {
    expect(filterSubagents(OPTIONS, 'pub').map((o) => o.name)).toEqual(['publisher']);
    expect(filterSubagents(OPTIONS, 'ANAL').map((o) => o.name)).toEqual([
      'analyst',
      'analyst-extra',
    ]);
    expect(filterSubagents(OPTIONS, 'lyst').map((o) => o.name)).toEqual([
      'analyst',
      'analyst-extra',
    ]);
  });

  it('returns all options for an empty query', () => {
    expect(filterSubagents(OPTIONS, '')).toEqual(OPTIONS);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterSubagents(OPTIONS, 'zzz')).toEqual([]);
  });
});

describe('slashHighlightParts', () => {
  const names = ['analyst', 'publisher'];

  it('highlights a finished subagent name and leaves the rest plain', () => {
    expect(slashHighlightParts('/analyst calculate', names)).toEqual([
      { text: '/analyst', highlighted: true },
      { text: ' calculate', highlighted: false },
    ]);
  });

  it('does not highlight a prefix that is still being typed', () => {
    expect(slashHighlightParts('/pu', names)).toEqual([
      { text: '/pu', highlighted: false },
    ]);
  });

  it('does not highlight an unknown slash or a url', () => {
    expect(slashHighlightParts('/tmp and https://example.com/analyst', names)).toEqual([
      { text: '/tmp and https://example.com/analyst', highlighted: false },
    ]);
  });
});

describe('applySubagentName', () => {
  it('replaces the whole token so leftover letters do not stay', () => {
    expect(applySubagentName('see /anal extra', 4, 'analyst')).toEqual({
      value: 'see /analyst extra',
      caret: 'see /analyst '.length,
    });
    expect(applySubagentName('/anal', 0, 'analyst')).toEqual({
      value: '/analyst ',
      caret: '/analyst '.length,
    });
  });
});

describe('matchingSubagentNames', () => {
  it('keeps catalog spelling for names that were real when the message was sent', () => {
    expect(matchingSubagentNames('/Analyst and /publisher again /analyst', ['analyst', 'publisher'])).toEqual([
      'analyst',
      'publisher',
    ]);
    expect(matchingSubagentNames('/tmp and https://example.com/analyst', ['analyst'])).toEqual([]);
  });
});

describe('fetchMentionCatalog', () => {
  beforeEach(() => {
    vi.mocked(authenticatedFetch).mockReset();
  });

  it('loads names and descriptions from /mentions', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ subagents: OPTIONS }), { status: 200 }),
    );
    await expect(fetchMentionCatalog()).resolves.toEqual(OPTIONS);
    expect(authenticatedFetch).toHaveBeenCalledWith('/api/proxy/agent/mentions', {
      cache: 'no-store',
    });
  });

  it('rejects a failed response', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 500 }));
    await expect(fetchMentionCatalog()).rejects.toThrow(/mentions 500/);
  });
});
