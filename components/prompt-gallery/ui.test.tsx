import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Fixture, GallerySpec } from './index';
import { Gallery } from './ui';

interface Lanterns {
  readonly prompt: string | null;
  readonly result: string | null;
}
const fx = (group: Fixture<Lanterns>['group'], kind: string, state: Fixture<Lanterns>['state'], note?: string): Fixture<Lanterns> => (note === undefined ? { group, kind, state } : { group, kind, state, note });
const SPEC: GallerySpec<Lanterns> = {
  prompts: ['light', 'trim', 'refill'],
  endings: ['won', 'lost'],
  fixtures: [
    fx('prompt', 'light', () => ({ prompt: 'light', result: null }), 'seed lamp-3, 4 actions'),
    fx('prompt', 'trim', () => ({ prompt: 'light', result: null })),
    fx('ending', 'won', () => Promise.resolve({ prompt: null, result: 'won' })),
    fx('ending', 'lost', () => new Promise<Lanterns>(() => undefined)),
  ],
  kindOf: (s, group) => (group === 'prompt' ? s.prompt : s.result),
};
const href = (id: string): string => `#/dev/${id}`;
const draw = (s: Lanterns, _e: unknown, answer: (picks: readonly string[]) => boolean) => (
  <div>
    <span>{s.prompt === null ? `The row is ${String(s.result)}` : `Which lamp to ${s.prompt}?`}</span>
    <button type="button" onClick={() => answer(['lamp-1'])}>
      Lamp 1
    </button>
    <button type="button" onClick={() => answer(['lamp-9'])}>
      Lamp 9
    </button>
  </div>
);

describe('Gallery', () => {
  it('lists every kind with its link and marks the one with no fixture', () => {
    render(<Gallery spec={SPEC} selected={null} href={href} render={draw} />);
    expect(screen.getByRole('navigation', { name: 'Prompt kinds' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'light' })).toHaveAttribute('href', '#/dev/prompt:light');
    expect(screen.getByRole('link', { name: 'refill (no fixture)' })).toHaveAttribute('data-missing');
    expect(screen.getByRole('link', { name: 'won' })).toHaveAttribute('href', '#/dev/ending:won');
    expect(screen.getByText('Choose a kind. Each one opens on its fixture.')).toBeInTheDocument();
    expect(screen.queryByTestId('gallery-fixture')).toBeNull();
  });

  it('shows the fixture on the game render, lists checked answers and plays none', async () => {
    const check = vi.fn((_s: Lanterns, picks: readonly string[]) => (picks[0] === 'lamp-1' ? true : 'no such lamp'));
    render(<Gallery spec={SPEC} selected="prompt:light" href={href} render={draw} check={check} title="Lanterns gallery" />);
    expect(await screen.findByText('Which lamp to light?', undefined, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lanterns gallery' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'light' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('gallery-fixture')).toHaveAttribute('data-kind', 'light');
    expect(screen.getByText('seed lamp-3, 4 actions')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lamp 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lamp 9' }));
    expect(screen.getByTestId('gallery-answers').textContent).toBe('["lamp-1"]: valid["lamp-9"]: refused (no such lamp)');
    expect(check).toHaveBeenCalledWith({ prompt: 'light', result: null }, ['lamp-1']);
    fireEvent.click(screen.getByRole('button', { name: 'Open it again' }));
    expect(screen.getByText('Which lamp to light?')).toBeInTheDocument();
  });

  it('lists an answer as not checked when the game passes no check', async () => {
    render(<Gallery spec={SPEC} selected="ending:won" href={href} render={draw} />);
    expect(await screen.findByText('The row is won', undefined, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByTestId('gallery-fixture')).toHaveAttribute('data-group', 'ending');
    fireEvent.click(screen.getByRole('button', { name: 'Lamp 1' }));
    expect(screen.getByTestId('gallery-answers').textContent).toBe('["lamp-1"]: not checked');
  });

  it('says so for a stale fixture, one that never loads, a missing one and an unknown id', async () => {
    const { rerender } = render(<Gallery spec={SPEC} selected="prompt:trim" href={href} render={draw} />);
    expect(await screen.findByText('The fixture prompt:trim is stale: shows light, not trim.', undefined, { timeout: 2000 })).toBeInTheDocument();
    rerender(<Gallery spec={SPEC} selected="ending:lost" href={href} render={draw} loadMs={20} />);
    expect(screen.getByText('Loading ending:lost…')).toBeInTheDocument();
    expect(await screen.findByText('The fixture ending:lost is stale: did not load in 20 ms.', undefined, { timeout: 2000 })).toBeInTheDocument();
    rerender(<Gallery spec={SPEC} selected="prompt:refill" href={href} render={draw} />);
    expect(screen.getByText('No fixture for the prompt kind refill.')).toBeInTheDocument();
    rerender(<Gallery spec={SPEC} selected="prompt:polish" href={href} render={draw} />);
    expect(screen.getByText('The game lists no kind prompt:polish.')).toBeInTheDocument();
    rerender(<Gallery spec={{ prompts: [], endings: [], fixtures: [] }} selected="" href={href} render={draw} />);
    expect(screen.queryAllByRole('link')).toEqual([]);
  });

  it('keeps the gallery up when the game render throws on one fixture', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const picky = (s: Lanterns, e: unknown, answer: (picks: readonly string[]) => boolean) => {
      if (s.result === 'won') throw new Error('no end screen for won');
      return draw(s, e, answer);
    };
    const { rerender } = render(<Gallery spec={SPEC} selected="ending:won" href={href} render={picky} />);
    expect(await screen.findByText('The fixture ending:won failed to draw: no end screen for won.', undefined, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByTestId('gallery-fixture')).toHaveAttribute('data-kind', 'won');
    expect(screen.getByRole('link', { name: 'light' })).toBeInTheDocument();
    rerender(<Gallery spec={SPEC} selected="prompt:light" href={href} render={picky} />);
    expect(await screen.findByText('Which lamp to light?', undefined, { timeout: 2000 })).toBeInTheDocument();
    quiet.mockRestore();
  });
});
