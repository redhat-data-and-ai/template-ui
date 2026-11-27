import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EvalDatasetPage } from './EvalDatasetPage';

const turn = (id: string) => ({
  id, userMessage: 'q', expectedResponse: 'a', expectedIntent: '', expectedKeywords: [],
  toolCallEnabled: false, toolCallOrdered: false, expectedToolCalls: [],
});
const dataset = {
  judge_model: 'gpt-4o',
  dataset: {
    cases: [
      { id: '1', name: 'alpha-case', description: 'first', tag: 'non_hitl', turns: [turn('t1')], createdAt: '2026-11-01T00:00:00Z' },
      { id: '2', name: 'beta-case', description: 'second', tag: 'hitl', turns: [turn('t2')], createdAt: '2026-11-02T00:00:00Z' },
    ],
  },
};
const models = { models: [{ model: 'gpt-4o', source: 'openai', default: true }] };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const json = url.includes('/evals/models') ? models : init?.method === 'POST' ? {} : dataset;
    return { ok: true, status: 200, json: async () => json } as Response;
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  return render(<MemoryRouter><EvalDatasetPage /></MemoryRouter>);
}

describe('EvalDatasetPage', () => {
  it('lists cases and filters by search text and tag', async () => {
    renderPage();
    expect(await screen.findByText('alpha-case')).toBeInTheDocument();
    expect(screen.getByText('beta-case')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search test cases'), { target: { value: 'beta' } });
    expect(screen.queryByText('alpha-case')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 2 cases')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search test cases'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filter by tag' }));
    fireEvent.click(await screen.findByRole('option', { name: 'hitl' }));
    expect(screen.queryByText('alpha-case')).not.toBeInTheDocument();
    expect(screen.getByText('beta-case')).toBeInTheDocument();
  });

  it('opens the add dialog and persists a deletion', async () => {
    renderPage();
    await screen.findByText('alpha-case');
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Delete alpha-case' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('alpha-case')).not.toBeInTheDocument());
    const posts = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([, i]) => i?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1].body).cases.map((c: { id: string }) => c.id)).toEqual(['2']);
  });

  it('shows a retryable error when loading fails', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    renderPage();
    expect(await screen.findByText(/Failed to load dataset \(401\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
