import { describe, expect, it } from 'vitest';
import { toolLabel, toolLabels } from './tool-label';

describe('toolLabel', () => {
  it('names the server and the action', () => {
    expect(toolLabel('gitlab_list_merge_requests')).toBe('GitLab · list merge requests');
  });

  it('handles a multi-word server prefix', () => {
    expect(toolLabel('gworkspace_search_gmail_messages')).toBe(
      'Google Workspace · search gmail messages',
    );
  });

  it('leaves an unprefixed tool readable', () => {
    // No server to name, so just undo the wire formatting. Guessing
    // a prefix off the first underscore would turn this into
    // "List · merge requests".
    expect(toolLabel('list_merge_requests')).toBe('list merge requests');
  });

  it('leaves a single word alone', () => {
    expect(toolLabel('search')).toBe('search');
  });

  it('is safe on empty input', () => {
    expect(toolLabel('')).toBe('');
  });

  it('joins several tools into one line', () => {
    expect(toolLabels('gitlab_get_issue,atlan_search_assets')).toBe(
      'GitLab · get issue, Atlan · search assets',
    );
  });
});

describe('camelCase tool names', () => {
  it('splits camelCase into words', () => {
    // Servers name tools either way, sometimes in the same server.
    expect(toolLabel('atlassian_searchJiraIssuesUsingJql')).toBe(
      'Atlassian · search jira issues using jql',
    );
  });

  it('handles camelCase with no server prefix', () => {
    expect(toolLabel('getAccessibleAtlassianResources')).toBe(
      'get accessible atlassian resources',
    );
  });

  it('handles a name mixing both conventions', () => {
    expect(toolLabel('gworkspace_get_gmail_messages_content')).toBe(
      'Google Workspace · get gmail messages content',
    );
  });
});
