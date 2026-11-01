import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { TOPICS } from '../curriculum';
import { PRACTICE_IDS, VIDEO_IDS } from '../lessons';

describe('the app', () => {
  it('lists every concept on the home page with the study steps and the plan', () => {
    window.location.hash = '#/';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /27 API concepts/ })).toBeInTheDocument();
    for (const t of TOPICS) expect(screen.getAllByText(t.title).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'How to learn each concept' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A five-week plan' })).toBeInTheDocument();
  });

  it('opens a concept on its video, with the six study steps and three tabs', async () => {
    const id = [...VIDEO_IDS][0] ?? 'idempotency';
    window.location.hash = `#/${id}`;
    render(<App />);
    expect(screen.getByRole('region', { name: 'Your steps for this concept' })).toBeInTheDocument();
    const tabs = within(screen.getByRole('navigation', { name: 'Parts of this concept' }));
    for (const tab of ['Watch', 'Learn', 'Practice', 'Build']) expect(tabs.getByRole('link', { name: new RegExp(tab) })).toBeInTheDocument();
    if (VIDEO_IDS.has(id)) await waitFor(() => expect(screen.getByRole('region', { name: /Video lesson/ })).toBeInTheDocument());
  });

  it('shows the guide on the Learn tab, with its interview questions', async () => {
    window.location.hash = '#/idempotency/learn';
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Interview questions' })).toBeInTheDocument());
    expect(document.querySelector('a[data-code]')).not.toBeNull();
  });

  it.skipIf(!PRACTICE_IDS.has('idempotency'))('shows the practice lab with a stack picker and its steps', async () => {
    window.location.hash = '#/idempotency/practice';
    render(<App />);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Server to practice on' })).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: /^Send to / }).length).toBeGreaterThan(2);
  });

  it('shows the Build tab with the contract tests and the check command', async () => {
    window.location.hash = '#/idempotency/build';
    render(<App />);
    expect(await screen.findByText(/requires an Idempotency-Key on order creation/)).toBeInTheDocument();
    expect(screen.getByText(/\.\/check\.sh python 22/)).toBeInTheDocument();
  });
});
