import { describe, expect, it } from 'vitest';
import {
  authRequestsFromProvenance,
  parseAuthRequests,
  parseReloadedTools,
  stripAuthMarkers,
  stripReloadedMarkers,
} from './mcp-auth-marker';

const NOT_CONNECTED =
  '[AUTH_REQUIRED mcp=atlan reason=not_connected url=https://a/connect] ' +
  'Cannot use atlan: it is not connected for this user.';
const EXPIRED =
  '[AUTH_REQUIRED mcp=gitlab reason=expired url=https://g/connect] ' +
  'Cannot use gitlab: your session for it has expired.';

describe('parseAuthRequests', () => {
  it('reads the server and reason, and ignores any url', () => {
    expect(parseAuthRequests(NOT_CONNECTED)).toEqual([
      { mcpName: 'atlan', reason: 'not_connected' },
    ]);
  });

  it('distinguishes an expired session from one never connected', () => {
    // Different sentences, different fixes. Telling someone to set up
    // an integration they already set up is the wrong instruction.
    expect(parseAuthRequests(EXPIRED)[0].reason).toBe('expired');
  });

  it('finds several integrations in one answer', () => {
    const names = parseAuthRequests(`${NOT_CONNECTED}\n\n${EXPIRED}`).map((r) => r.mcpName);
    expect(names).toEqual(['atlan', 'gitlab']);
  });

  it('offers one button per server, not one per failed tool', () => {
    const twice = `${NOT_CONNECTED}\n${NOT_CONNECTED}`;
    expect(parseAuthRequests(twice)).toHaveLength(1);
  });

  it('returns nothing for an ordinary answer', () => {
    expect(parseAuthRequests('Here are your meetings for Monday.')).toEqual([]);
  });
});

describe('stripAuthMarkers', () => {
  it('removes the marker from what the reader sees', () => {
    const out = stripAuthMarkers(NOT_CONNECTED);
    expect(out).not.toContain('AUTH_REQUIRED');
    expect(out).toContain('Cannot use atlan');
  });

  it('leaves an ordinary answer untouched', () => {
    const text = 'Here are your meetings for Monday.';
    expect(stripAuthMarkers(text)).toBe(text);
  });
});

describe('authRequestsFromProvenance', () => {
  it('reads structured requests off the message', () => {
    expect(
      authRequestsFromProvenance({
        auth_required: [
          { mcp_name: 'atlassian', reason: 'not_connected', connect_url: 'https://a/c' },
        ],
      }),
    ).toEqual([
      { mcpName: 'atlassian', reason: 'not_connected' },
    ]);
  });

  it('is empty when the turn reached everything', () => {
    expect(authRequestsFromProvenance({})).toEqual([]);
    expect(authRequestsFromProvenance(undefined)).toEqual([]);
  });

  it('survives a model that paraphrases the marker away', () => {
    // The actual failure: asked to list Jira issues with Atlassian
    // disconnected, the agent wrote its own "please connect Jira in
    // Settings" and dropped the marker. Text parsing found nothing;
    // provenance still carries the request.
    const paraphrased = 'I cannot list your Jira issues because Jira is not connected.';
    expect(parseAuthRequests(paraphrased)).toEqual([]);
    expect(
      authRequestsFromProvenance({
        auth_required: [
          { mcp_name: 'atlassian', reason: 'not_connected', connect_url: 'https://a/c' },
        ],
      }),
    ).toHaveLength(1);
  });
});

describe('stripAuthMarkers — connect URLs in prose', () => {
  it('removes a markdown connect link the model wrote itself', () => {
    const text =
      'Dataverse is not connected.\n\nPlease connect it in Settings → MCP (or visit ' +
      '[http://localhost:8081/mcp/dataverse/connect](http://localhost:8081/mcp/dataverse/connect)), ' +
      'and then ask again.';
    const out = stripAuthMarkers(text);
    expect(out).not.toContain('localhost');
    expect(out).not.toContain('/connect');
    expect(out).toContain('Settings → MCP');
  });

  it('removes a bare connect URL', () => {
    const out = stripAuthMarkers('Connect at https://agent.example.com/mcp/atlassian/connect now.');
    expect(out).toBe('Connect at now.');
  });

  it('leaves ordinary links alone', () => {
    const url = 'https://gitlab.example.com/group/project/-/merge_requests/42';
    expect(stripAuthMarkers(`See ${url} for the diff.`)).toContain(url);
  });
});

describe('parseReloadedTools', () => {
  it('finds the system that authorized itself mid-turn', () => {
    expect(parseReloadedTools('[TOOLS_RELOADED mcp=dataverse] now authorized')).toEqual([
      'dataverse',
    ]);
  });

  it('reports each system once', () => {
    const text = '[TOOLS_RELOADED mcp=dataverse] x [TOOLS_RELOADED mcp=dataverse] y';
    expect(parseReloadedTools(text)).toEqual(['dataverse']);
  });

  it('finds nothing in an ordinary answer', () => {
    expect(parseReloadedTools('Your manager is Nirav Kumar.')).toEqual([]);
    expect(parseReloadedTools('')).toEqual([]);
  });

  it('strips the marker out of the prose', () => {
    const out = stripReloadedMarkers('[TOOLS_RELOADED mcp=dataverse] Dataverse is now authorized.');
    expect(out).toBe('Dataverse is now authorized.');
  });
});
