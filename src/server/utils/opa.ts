import { readFileSync, readdirSync, existsSync, watch, mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { loadPolicy } from "@open-policy-agent/opa-wasm";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface PolicyViolation {
  message: string;
}

export interface EvaluationResult {
  denials: PolicyViolation[];
  warnings: PolicyViolation[];
}

export interface OpaEngine {
  evaluate(input: Record<string, unknown>): PolicyViolation[];
  evaluateWithModes(input: Record<string, unknown>): EvaluationResult;
  reload(): Promise<void>;
  isLoaded(): boolean;
  destroy(): void;
}

type LoadedPolicy = Awaited<ReturnType<typeof loadPolicy>>;

interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

function resolvePolicyDir(policyPath: string): string {
  if (policyPath && !policyPath.startsWith("/")) {
    return resolve(__dirname, "../../../", policyPath);
  }
  return policyPath || resolve(__dirname, "../../../config/compliance");
}

function hasRegoFiles(dir: string): boolean {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(".rego"));
}

function mergeOverrides(baseDir: string, overridesDir: string | undefined, log: Logger): string | null {
  if (!overridesDir || !existsSync(overridesDir)) return null;

  const tmp = mkdtempSync(join(tmpdir(), "opa-merged-"));
  try {
    for (const f of readdirSync(baseDir)) {
      if (f.endsWith(".rego") || f.endsWith(".json")) {
        copyFileSync(join(baseDir, f), join(tmp, f));
      }
    }
    for (const f of readdirSync(overridesDir)) {
      if (f.endsWith(".rego") || f.endsWith(".json")) {
        copyFileSync(join(overridesDir, f), join(tmp, f));
        log.info(`Policy override applied: ${f}`);
      }
    }
    return tmp;
  } catch (err) {
    log.error(`Failed to merge override directory: ${err instanceof Error ? err.message : String(err)}`);
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
    return null;
  }
}

function compilePolicies(policyDir: string, log: Logger): Buffer | null {
  if (!hasRegoFiles(policyDir)) {
    return null;
  }

  const tmp = mkdtempSync(join(tmpdir(), "opa-bundle-"));
  const bundlePath = join(tmp, "bundle.tar.gz");

  try {
    execFileSync("opa", [
      "build",
      "-t", "wasm",
      "-e", "compliance/ui/deny",
      "-e", "compliance/ui/violations",
      "-o", bundlePath,
      policyDir,
    ], { timeout: 30_000, stdio: "pipe" });

    const bundle = readFileSync(bundlePath);
    log.info(`OPA policies compiled from ${policyDir}`);
    return bundle;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("not found")) {
      log.error("opa CLI not found — install OPA to enable policy compilation (https://www.openpolicyagent.org/docs/latest/#running-opa)");
    } else {
      log.error(`OPA compilation failed: ${msg}`);
    }
    return null;
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* cleanup is best-effort */ }
  }
}

function extractViolations(policy: LoadedPolicy, input: Record<string, unknown>, entrypoint: string): PolicyViolation[] {
  try {
    const resultSets = policy.evaluate(input, entrypoint);
    if (!resultSets?.length) return [];

    const first = resultSets[0]?.result;
    if (!first || !Array.isArray(first)) return [];

    return first.map((d: unknown) => ({
      message: typeof d === "object" && d !== null && "msg" in d
        ? String((d as { msg: unknown }).msg)
        : String(d),
    }));
  } catch {
    return [];
  }
}

export async function createOpaEngine(
  policyPath: string,
  logger?: Logger,
  overridesPath?: string,
): Promise<OpaEngine> {
  const policyDir = resolvePolicyDir(policyPath);
  let policy: LoadedPolicy | null = null;
  let watcher: ReturnType<typeof watch> | null = null;
  let overridesWatcher: ReturnType<typeof watch> | null = null;
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;
  let mergedDir: string | null = null;
  const log = logger ?? { info: console.log, warn: console.warn, error: console.error };

  const resolvedOverrides = overridesPath
    ? resolvePolicyDir(overridesPath)
    : undefined;

  async function compileAndLoad(): Promise<void> {
    if (mergedDir) {
      try { rmSync(mergedDir, { recursive: true, force: true }); } catch { /* best-effort */ }
      mergedDir = null;
    }

    let compileDir = policyDir;
    if (resolvedOverrides && existsSync(resolvedOverrides)) {
      mergedDir = mergeOverrides(policyDir, resolvedOverrides, log);
      if (mergedDir) compileDir = mergedDir;
    }

    const bundle = compilePolicies(compileDir, log);
    if (!bundle) {
      policy = null;
      return;
    }
    try {
      policy = await loadPolicy(bundle);
    } catch (err) {
      log.error(`Failed to load compiled OPA bundle: ${err instanceof Error ? err.message : String(err)}`);
      policy = null;
    }
  }

  function evaluate(input: Record<string, unknown>): PolicyViolation[] {
    if (!policy) return [];
    try {
      const resultSets = policy.evaluate(input);
      if (!resultSets?.length) return [];

      const first = resultSets[0]?.result;
      if (!first) return [];

      const denials: unknown[] = first.deny ?? first.violations ?? [];
      if (!Array.isArray(denials)) return [];

      return denials.map((d) => ({
        message: typeof d === "object" && d !== null && "msg" in d
          ? String((d as { msg: unknown }).msg)
          : String(d),
      }));
    } catch (err) {
      log.error(`OPA evaluation error: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  function evaluateWithModes(input: Record<string, unknown>): EvaluationResult {
    if (!policy) return { denials: [], warnings: [] };
    return {
      denials: extractViolations(policy, input, "compliance/ui/deny"),
      warnings: extractViolations(policy, input, "compliance/ui/violations"),
    };
  }

  function scheduleReload(filename: string): void {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      log.info(`Policy file changed (${filename}) — recompiling`);
      await compileAndLoad();
    }, 500);
  }

  function startWatching(): void {
    if (existsSync(policyDir)) {
      try {
        watcher = watch(policyDir, (eventType, filename) => {
          if (!filename?.endsWith(".rego") && !filename?.endsWith(".json")) return;
          scheduleReload(filename);
        });
        watcher.on("error", () => {});
      } catch { /* watcher setup is optional */ }
    }
    if (resolvedOverrides && existsSync(resolvedOverrides)) {
      try {
        overridesWatcher = watch(resolvedOverrides, (eventType, filename) => {
          if (!filename?.endsWith(".rego") && !filename?.endsWith(".json")) return;
          scheduleReload(filename);
        });
        overridesWatcher.on("error", () => {});
      } catch { /* watcher setup is optional */ }
    }
  }

  function destroy(): void {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    if (overridesWatcher) {
      overridesWatcher.close();
      overridesWatcher = null;
    }
    if (reloadTimer) {
      clearTimeout(reloadTimer);
      reloadTimer = null;
    }
    if (mergedDir) {
      try { rmSync(mergedDir, { recursive: true, force: true }); } catch { /* best-effort */ }
      mergedDir = null;
    }
    policy = null;
  }

  await compileAndLoad();
  startWatching();

  return {
    evaluate,
    evaluateWithModes,
    reload: compileAndLoad,
    isLoaded: () => policy !== null,
    destroy,
  };
}
