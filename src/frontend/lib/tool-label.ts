/**
 * A tool name a person can read.
 *
 * MCP tools are named for the wire: `gitlab_list_merge_requests`,
 * `gworkspace_search_gmail_messages`. Shown raw in a status line
 * that is meant to tell someone what is happening, they read as
 * internals leaking out.
 *
 * Only cosmetic. The raw name stays in logs and audit, where it is
 * the thing you actually search for.
 */

/**
 * Servers whose name prefixes their tools. Left as a list rather
 * than parsed off the first underscore: `list_merge_requests` has
 * no server prefix, and guessing would turn it into "List".
 */
const SERVER_PREFIXES = [
  'gitlab',
  'gworkspace',
  'atlassian',
  'atlan',
  'datadog',
  'dataverse',
  'miro',
  'unstructured_data',
  'unstructured-data',
  'mcp',
];

const SERVER_LABELS: Record<string, string> = {
  gitlab: 'GitLab',
  gworkspace: 'Google Workspace',
  atlassian: 'Atlassian',
  atlan: 'Atlan',
  datadog: 'Datadog',
  dataverse: 'Dataverse',
  miro: 'Miro',
  unstructured_data: 'Unstructured Data',
  'unstructured-data': 'Unstructured Data',
};

/** `searchJiraIssuesUsingJql` -> `search jira issues using jql`. */
function words(name: string): string {
  return name
    // Servers name tools either way, sometimes in the same server:
    // `search_gmail_messages` next to `getAccessibleAtlassianResources`.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase();
}

/** `gitlab_list_merge_requests` -> `GitLab · list merge requests`. */
export function toolLabel(raw: string): string {
  const name = raw.trim();
  if (!name) return name;

  for (const prefix of SERVER_PREFIXES) {
    if (!name.startsWith(`${prefix}_`)) continue;
    const server = SERVER_LABELS[prefix];
    const rest = words(name.slice(prefix.length + 1));
    return server ? `${server} · ${rest}` : rest;
  }
  return words(name);
}

/** Several tools at once, as one line. */
export function toolLabels(raw: string): string {
  return raw
    .split(',')
    .map((n) => toolLabel(n))
    .filter(Boolean)
    .join(', ');
}
