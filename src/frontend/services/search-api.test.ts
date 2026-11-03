import { describe, it, expect } from 'vitest';
import { parseSnippet } from './search-api';

describe('parseSnippet', () => {
  it('splits highlighted runs out of a ts_headline snippet', () => {
    expect(parseSnippet('how do I <<deploy>> this')).toEqual([
      { text: 'how do I ', match: false },
      { text: 'deploy', match: true },
      { text: ' this', match: false },
    ]);
  });

  it('handles several matches', () => {
    const parts = parseSnippet('<<a>> and <<b>>');
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['a', 'b']);
  });

  it('handles a snippet with no match markers', () => {
    expect(parseSnippet('plain text')).toEqual([{ text: 'plain text', match: false }]);
  });

  it('handles an empty snippet', () => {
    expect(parseSnippet('')).toEqual([]);
  });

  it('does not treat HTML in the snippet as markup', () => {
    // The snippet is the user's own message content. Returning it as
    // markup and rendering it would be stored XSS; these must stay
    // plain text nodes.
    const parts = parseSnippet('<<script>>alert(1)</script>');
    expect(parts.some((p) => p.text.includes('<script>'))).toBe(false);
    expect(parts.map((p) => p.text).join('')).toContain('alert(1)');
  });

  it('keeps a trailing unmatched tail', () => {
    expect(parseSnippet('<<x>>tail')).toEqual([
      { text: 'x', match: true },
      { text: 'tail', match: false },
    ]);
  });
});
