import { readFileSync, watch, FSWatcher } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

export interface GroupRoleMapping {
  role: string;
  group: string;
}

export type Accessibility = "public" | "private";

export interface PromptMdConfig {
  name?: string;
  groups: GroupRoleMapping[] | null;
  accessibility: Accessibility;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_MD_PATH = resolve(__dirname, "../../../config/ui/PROMPT.md");

let cached: PromptMdConfig | null = null;
let watcher: FSWatcher | null = null;

function parseFrontMatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) return null;
  try {
    const parsed = yaml.load(match[1]);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    console.warn("[PromptMd] Failed to parse YAML front matter");
    return null;
  }
}

function parseConfig(filePath: string): PromptMdConfig {
  try {
    const content = readFileSync(filePath, "utf-8");
    const frontMatter = parseFrontMatter(content);
    if (!frontMatter) return { groups: null, accessibility: "private" };

    const name =
      typeof frontMatter.name === "string" ? frontMatter.name : undefined;
    const accessibility: Accessibility =
      frontMatter.accessibility === "public" ? "public" : "private";

    if (!Array.isArray(frontMatter.groups) || frontMatter.groups.length === 0) {
      return { name, groups: null, accessibility };
    }

    const groups: GroupRoleMapping[] = [];
    for (const entry of frontMatter.groups) {
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as Record<string, unknown>).role === "string" &&
        typeof (entry as Record<string, unknown>).group === "string"
      ) {
        groups.push({
          role: (entry as Record<string, string>).role.toLowerCase(),
          group: (entry as Record<string, string>).group,
        });
      }
    }

    return { name, groups: groups.length > 0 ? groups : null, accessibility };
  } catch {
    console.debug(
      `[PromptMd] Could not read ${filePath} — no group restrictions`,
    );
    return { groups: null, accessibility: "private" };
  }
}

/** Load and cache group-to-role mappings from PROMPT.md YAML front matter. Returns { groups: null } when no groups are configured. */
export function loadPromptMdConfig(): PromptMdConfig {
  if (cached) return cached;
  cached = parseConfig(PROMPT_MD_PATH);
  return cached;
}

/** Watch PROMPT.md for changes and invalidate the cached config. Returns a cleanup function. */
export function startPromptMdWatcher(): () => void {
  const filePath = PROMPT_MD_PATH;
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  let debounceTimer: NodeJS.Timeout | null = null;

  try {
    watcher = watch(filePath, (eventType) => {
      if (eventType !== "change") return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log("[PromptMd] File changed, reloading config");
        cached = null;
        loadPromptMdConfig();
      }, 100);
    });

    watcher.on("error", () => {
      /* file may not exist in dev */
    });
  } catch {
    /* file may not exist — that's fine */
  }

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  };
}

/** Clear the cached config so the next loadPromptMdConfig() call re-reads the file. */
export function resetPromptMdConfig(): void {
  cached = null;
}
