#!/usr/bin/env node
/**
 * Dev-only screenshot tool for visual comparison during the look-and-feel work.
 *
 * Usage:
 *   node scripts/capture-screens.mjs --base <url> --out <dir>
 *     [--widths 1440,1920] [--modes light,dark] [--set template-ui]
 *
 * Writes <dir>/<set>-<page>-<mode>-<width>.png. Theme is chosen by writing the
 * set's localStorage key before navigation. Screenshots are never committed.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const THEME_KEYS = { 'template-ui': 'template-ui-theme' };

function parseArgs(argv) {
  const args = { widths: '1440,1920', modes: 'light,dark', set: 'template-ui' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!key || argv[i + 1] === undefined) throw new Error(`Bad arguments near "${argv[i]}"`);
    args[key] = argv[i + 1];
  }
  if (!args.base || !args.out) throw new Error('Required: --base <url> --out <dir>');
  if (!THEME_KEYS[args.set]) throw new Error(`Unknown --set "${args.set}"`);
  return { ...args, widths: args.widths.split(',').map(Number), modes: args.modes.split(',') };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const turn = (id, userMessage) => ({
  id,
  userMessage,
  expectedResponse: 'A short, correct answer.',
  expectedIntent: 'answer_question',
  expectedKeywords: [],
  toolCallEnabled: false,
  toolCallOrdered: false,
  expectedToolCalls: [],
});
const SAMPLE_CASES = [
  { id: 'c1', name: 'Greeting', description: 'Simple hello', tag: 'non_hitl', turns: [turn('t1', 'Hello')], createdAt: '2026-01-01T00:00:00Z' },
  { id: 'c2', name: 'Follow-up', description: 'Two turns', tag: 'multi_turn', turns: [turn('t1', 'Hi'), turn('t2', 'And then?')], createdAt: '2026-01-02T00:00:00Z' },
];

/** Each page: { name, run(page, base) -> optional extra steps; may return false to skip }. */
const PAGES = {
  'template-ui': async function* (page, base) {
    await page.goto(`${base}/chat`);
    await page.waitForSelector('textarea', { state: 'visible' });
    yield 'chat';

    await page.goto(`${base}/settings`);
    // Wide viewports use a vertical nav, narrow ones tabs.
    const sections = page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link');
    const tabs = page.getByRole('tab');
    await page.waitForSelector('[role="tab"], nav[aria-label="Settings sections"] a', { state: 'visible' });
    const useTabs = (await tabs.count()) > 0;
    const items = useTabs ? tabs : sections;
    const names = (await items.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    for (const name of names) {
      await items.filter({ hasText: name }).first().click();
      await page.waitForTimeout(400);
      yield `settings-${slug(name)}`;
    }

    // The dataset API needs a real agent session; stub it with sample data.
    await page.route('**/evals/models', (r) =>
      r.fulfill({ json: { models: [{ model: 'sample-model', default: true }] } }),
    );
    await page.route('**/evals/dataset', (r) =>
      r.request().method() === 'GET'
        ? r.fulfill({ json: { judge_model: 'sample-model', dataset: { cases: SAMPLE_CASES } } })
        : r.continue(),
    );
    await page.goto(`${base}/eval/dataset`);
    await page.waitForLoadState('networkidle');
    yield 'eval-dataset';

    const add = page.getByRole('button', { name: /Add Test Case/i }).first();
    if (await add.isVisible().catch(() => false)) {
      await add.click();
      await page.getByTestId('test-case-modal-backdrop').waitFor({ state: 'visible' });
      await page.waitForTimeout(300);
      yield 'eval-dataset-add-test-case-dialog';
    } else {
      console.warn('  ! "Add Test Case" button not visible; dialog capture skipped');
    }
  },
};

async function main() {
  const { base, out, widths, modes, set } = parseArgs(process.argv.slice(2));
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  const written = [];
  try {
    for (const mode of modes) {
      for (const width of widths) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          colorScheme: mode,
        });
        await context.addInitScript(
          ([key, value]) => {
            try {
              localStorage.setItem(key, value);
            } catch {
              /* storage unavailable */
            }
          },
          [THEME_KEYS[set], mode],
        );
        const page = await context.newPage();
        try {
          for await (const name of PAGES[set](page, base.replace(/\/$/, ''))) {
            const file = path.join(out, `${set}-${name}-${mode}-${width}.png`);
            await page.screenshot({ path: file });
            written.push(file);
            console.log(`wrote ${file}`);
          }
        } catch (err) {
          console.error(`  ! ${set} ${mode} ${width}: ${err.message.split('\n')[0]}`);
          process.exitCode = 1;
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`${written.length} screenshot(s) written to ${out}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
