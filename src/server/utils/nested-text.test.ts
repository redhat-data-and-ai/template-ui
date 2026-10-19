import { describe, expect, it } from 'vitest';
import { looksLikeJson } from './nested-stream';

/**
 * Only the subagent's own prose reaches the box.
 *
 * Its tool messages stream through the same channel, and an MCP
 * tool answers with JSON — a hundred lines of API response dumped
 * where the reader expects progress.
 */
describe('looksLikeJson', () => {
  it('catches a complete object', () => {
    expect(looksLikeJson('{"merge_requests": [{"iid": 50}]}')).toBe(true);
  });

  it('catches a complete array', () => {
    expect(looksLikeJson('[{"id": 1}, {"id": 2}]')).toBe(true);
  });

  it('catches a half-streamed blob', () => {
    // Mid-stream JSON is unparseable and still must not be shown as
    // prose, so an unclosed fragment that opens with a brace counts.
    expect(looksLikeJson('{"merge_requests": [{"iid": 50, "title": "fix: sort ADR ind')).toBe(
      true,
    );
  });

  it('leaves prose alone', () => {
    expect(looksLikeJson('Found 15 open merge requests across six projects.')).toBe(false);
  });

  it('leaves markdown alone', () => {
    expect(looksLikeJson('### Open Merge Requests\n\n| Title | Status |')).toBe(false);
  });

  it('leaves a short brace alone', () => {
    // A sentence can legitimately start with a brace; only a blob
    // long enough to be a payload is worth suppressing.
    expect(looksLikeJson('{ see below')).toBe(false);
  });
});
