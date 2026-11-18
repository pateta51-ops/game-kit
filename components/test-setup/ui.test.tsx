import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import './setup-dom.ts';
import { fakeArt, fakePack, installDomStubs } from './index.ts';

const Card = ({ c }: { c: { id: string; name: string; art: string } }) => (
  <img data-testid={c.id} alt={c.name} src={c.art} ref={(el) => el?.scrollIntoView()} />
);

describe('test-setup in jsdom', () => {
  it('the setup file lets a component that calls scrollIntoView render', () => {
    render(<Card c={{ id: 'a', name: 'A', art: fakeArt('A') }} />);
    expect(screen.getByTestId('a')).toBeTruthy();
    expect(window.matchMedia('(min-width: 1px)').matches).toBe(false);
    expect(typeof ResizeObserver).toBe('function');
    expect(typeof IntersectionObserver).toBe('function');
    expect(typeof requestAnimationFrame).toBe('function');
    new ResizeObserver(() => undefined).observe(document.body);
  });
  it('keeps existing implementations, applies size, restores on uninstall, and later matches:true wins', () => {
    const own = () => undefined;
    Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, writable: true, value: own });
    const before = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
    const undo = installDomStubs({ size: { width: 7, height: 9 }, matches: true });
    expect(Reflect.get(Element.prototype, 'scrollTo')).toBe(own);
    expect(document.body.scrollWidth).toBe(7);
    expect(document.body.clientHeight).toBe(9);
    expect(window.matchMedia('(x)').matches).toBe(true);
    undo();
    expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth')).toEqual(before);
    expect(window.matchMedia('(x)').matches).toBe(false);
  });
  it('the fixture pack renders', () => {
    const pack = fakePack({ count: 3, overrides: { 'fx-2': { name: 'Two' } } });
    render(<>{pack.cards.map((c) => <Card key={c.id} c={c} />)}</>);
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.getByAltText('Two').getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(fakeArt('x')).toBe(fakeArt('x'));
  });
});
