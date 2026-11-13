import { test, expect } from '@playwright/test';
import { mountConfig } from '../helpers/config-mount';
import { HomePage } from '../page-objects/HomePage';

const a = 'a'.repeat(32);
const b = 'b'.repeat(32);
const makeInterrupt = (id: string, target: string) => ({
  id, resumable: true,
  value: { action_requests: [{ name: 'same_tool', args: { target } }], review_configs: [] },
});
const interruptStream = (interrupts: unknown[], start = 0) => interrupts.map((content, chunk_id) =>
  `data: ${JSON.stringify({ type: 'interrupt', content, chunk_id: chunk_id + start })}\n\n`,
).join('') + 'data: [DONE]\n\n';

test('same tool with different arguments submits the clicked interrupt ID', async ({ page }) => {
  await mountConfig(page);
  const resumes: unknown[] = [];
  await page.route('**/api/proxy/agent/v1/stream', route => {
    const body = route.request().postDataJSON();
    if (body.resume) {
      resumes.push(body.message);
      return route.fulfill({ contentType: 'text/event-stream', body: 'data: [DONE]\n\n' });
    }
    const message = { type: 'message', chunk_id: 0, content: {
      type: 'ai', id: 'tool-message', content: '', tool_calls: [
        { id: 'call-a', name: 'same_tool', args: { target: 'A' } },
        { id: 'call-b', name: 'same_tool', args: { target: 'B' } },
      ],
    } };
    return route.fulfill({ contentType: 'text/event-stream', body:
      `data: ${JSON.stringify(message)}\n\n` + interruptStream([makeInterrupt(a, 'A'), makeInterrupt(b, 'B')], 1) });
  });
  const home = new HomePage(page);
  await home.goto(); await home.submitPrompt('Run the same tool for A and B');
  const cardA = page.locator(`[data-interrupt-id="${a}"]`);
  const cardB = page.locator(`[data-interrupt-id="${b}"]`);
  await expect(cardA).toContainText('"target": "A"');
  await expect(cardB).toContainText('"target": "B"');
  await expect(page.getByRole('button', { name: /^Approve/ })).toHaveCount(2);
  await expect(cardB.getByRole('alert', { name: 'Tool call same_tool requires approval' })).toBeVisible();
  await expect(cardB.getByText('Arguments', { exact: true })).toBeVisible();
  await expect(cardB.getByRole('button', { name: /^Approve/ })).toBeEnabled();
  await cardB.getByRole('button', { name: /^Approve/ }).click();
  await expect(cardB).not.toBeVisible();
  await expect(cardA).toBeVisible();
  expect(resumes).toEqual([{ [b]: { decisions: [{ type: 'approve' }] } }]);
  await cardA.getByRole('button', { name: /^Reject/ }).click();
  await expect(cardA).not.toBeVisible();
  expect(resumes).toEqual([
    { [b]: { decisions: [{ type: 'approve' }] } },
    { [a]: { decisions: [{ type: 'reject', message: 'User rejected this action.' }] } },
  ]);
});

test('multi-action approvals remain disabled until the interrupt stream reaches EOF', async ({ page }) => {
  await mountConfig(page);
  const interrupt = makeInterrupt(a, 'first');
  interrupt.value.action_requests.push({ name: 'same_tool', args: { target: 'second' } });
  await page.addInitScript(({ interrupt }) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
      if (String(input).endsWith('/v1/stream') && !body.resume) {
        return new Response(new ReadableStream({ start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'interrupt', content: interrupt, chunk_id: 0 })}\n\n`));
          (window as any).finishInterruptStream = () => controller.close();
        } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }
      return original(input, init);
    };
  }, { interrupt });
  const resumes: unknown[] = [];
  await page.route('**/api/proxy/agent/v1/stream', route => {
    resumes.push(route.request().postDataJSON().message);
    return route.fulfill({ contentType: 'text/event-stream', body: 'data: [DONE]\n\n' });
  });
  const home = new HomePage(page);
  await home.goto(); await home.submitPrompt('Run both actions');
  const card = page.locator(`[data-interrupt-id="${a}"]`);
  await expect(card.getByRole('button', { name: /^Approve/ })).toHaveCount(2);
  for (const button of await card.getByRole('button', { name: /^Approve/ }).all()) {
    await expect(button).toBeDisabled();
  }
  expect(resumes).toEqual([]);
  await page.evaluate(() => (window as any).finishInterruptStream());
  await expect(card.getByRole('button', { name: /^Approve/ }).first()).toBeEnabled();
  await card.getByRole('button', { name: /^Approve/ }).first().click();
  await card.getByRole('button', { name: /^Approve/ }).click();
  await expect(card).toHaveCount(0);
  expect(resumes).toEqual([{ [a]: { decisions: [{ type: 'approve' }, { type: 'approve' }] } }]);
});

test('a delayed refresh cannot restore consumed approvals or old messages', async ({ page }) => {
  await mountConfig(page);
  let releaseRefresh!: () => void;
  let refreshing = false;
  await page.route('**/api/proxy/agent/threads/*/state', async route => {
    refreshing = true;
    await new Promise<void>(resolve => { releaseRefresh = resolve; });
    await route.fulfill({ json: { values: { messages: [{ type: 'human', content: 'stale snapshot', id: 'old' }] }, tasks: [{ interrupts: [makeInterrupt(a, 'A')] }] } });
  });
  await page.route('**/api/proxy/agent/v1/stream', route => {
    const body = route.request().postDataJSON();
    const response = body.resume
      ? `data: ${JSON.stringify({ type: 'token', content: 'Fresh completed response', chunk_id: 0 })}\n\ndata: [DONE]\n\n`
      : interruptStream([makeInterrupt(a, 'A')]);
    return route.fulfill({ contentType: 'text/event-stream', body: response });
  });
  const home = new HomePage(page);
  await home.goto(); await home.submitPrompt('Run action A');
  const card = page.locator(`[data-interrupt-id="${a}"]`);
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Refresh approvals', exact: true }).click();
  await expect.poll(() => refreshing).toBe(true);
  await card.getByRole('button', { name: /^Approve/ }).click();
  await expect(page.getByText('Fresh completed response', { exact: true })).toBeVisible();
  const refreshed = page.waitForResponse(response => response.url().includes('/state'));
  releaseRefresh();
  await refreshed;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(card).toHaveCount(0);
  await expect(page.getByText('Fresh completed response', { exact: true })).toBeVisible();
  await expect(page.getByText('stale snapshot', { exact: true })).not.toBeVisible();
});

test('Enter approves after stream EOF without duplicating a tool whose result arrives before resume EOF', async ({ page }) => {
  await mountConfig(page);
  await page.addInitScript(({ id }) => {
    const original = window.fetch.bind(window);
    const event = (content: unknown, chunk_id: number, type = 'message') =>
      `data: ${JSON.stringify({ type, content, chunk_id })}\n\n`;
    const args = { content: 'hi', file_path: '/hi.txt' };
    window.fetch = async (input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      if (!String(input).endsWith('/v1/stream')) return original(input, init);
      return new Response(new ReadableStream({ start(controller) {
        const send = (text: string) => controller.enqueue(new TextEncoder().encode(text));
        if (body.resume) {
          (window as any).submittedApproval = body.message;
          send(event({ type: 'tool', tool_call_id: 'write-call', content: 'Successfully wrote /hi.txt' }, 0));
          send(event('Finishing the response', 1, 'token'));
          (window as any).finishApprovalResume = () => controller.close();
        } else {
          send(event({ type: 'ai', id: 'write-message', content: '', tool_calls: [
            { id: 'write-call', name: 'write_file', args },
          ] }, 0));
          send(event({ id, resumable: true, value: {
            action_requests: [{ name: 'write_file', args }], review_configs: [],
          } }, 1, 'interrupt'));
          (window as any).finishApprovalInitial = () => controller.close();
        }
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
    };
  }, { id: a });
  const home = new HomePage(page);
  await home.goto();
  await home.submitPrompt('Write hi to hi.txt');
  const approve = page.getByRole('button', { name: 'Approve tool call: write_file', exact: true });
  await expect(approve).toBeDisabled();
  await page.evaluate(() => (window as any).finishApprovalInitial());
  await expect(approve).toBeEnabled();
  await expect(approve).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Finishing the response', { exact: true })).toBeVisible();
  // Resume is still streaming: the completed original must be the only tool card.
  await expect(page.getByRole('button', { name: /^(Expand|Collapse) tool call: write_file$/ })).toHaveCount(1);
  await expect(page.getByText('Waiting...', { exact: true })).toHaveCount(0);
  await expect(approve).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).submittedApproval)).toEqual({
    [a]: { decisions: [{ type: 'approve' }] },
  });
  await page.evaluate(() => (window as any).finishApprovalResume());
  await expect(page.locator('[data-interrupt-id]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Expand|Collapse) tool call: write_file$/ })).toHaveCount(1);
});
