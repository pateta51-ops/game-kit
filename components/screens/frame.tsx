import { useSyncExternalStore, type HTMLAttributes, type ReactNode } from 'react';
import { nextTheme, type createThemeStore, type Theme } from './theme.ts';

export function ScreenFrame({
  title,
  back,
  actions,
  children,
  footer,
  cls,
}: {
  title: ReactNode;
  back?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  cls?: Partial<Record<'frame' | 'header' | 'title' | 'main', string>>;
}) {
  return (
    <div className={cls?.frame ?? 'kit-scr-frame'}>
      <header className={cls?.header ?? 'kit-scr-header'}>
        {back}
        <h1 className={cls?.title ?? 'kit-scr-title'}>{title}</h1>
        {actions}
      </header>
      <main className={cls?.main ?? 'kit-scr-main'}>{children}</main>
      {footer}
    </div>
  );
}

export function Footer({
  gameName,
  stamp,
  disclaimer,
  cls = 'kit-scr-footer',
  ...rest
}: {
  gameName: string;
  stamp: string;
  disclaimer: { text: string; href?: string };
  cls?: string;
} & Omit<HTMLAttributes<HTMLParagraphElement>, 'className'>) {
  return (
    <footer className={cls}>
      <p>
        {gameName} {stamp}
      </p>
      <p {...rest}>{disclaimer.href === undefined ? disclaimer.text : <a href={disclaimer.href}>{disclaimer.text}</a>}</p>
    </footer>
  );
}

export function ThemeToggle({
  store,
  words,
  cls = 'kit-scr-theme-toggle',
}: {
  store: ReturnType<typeof createThemeStore>;
  words: Record<Theme, { label: string; ariaLabel?: string }>;
  cls?: string;
}) {
  const theme = useSyncExternalStore(store.subscribe, store.getTheme, store.getTheme);
  const { label, ariaLabel } = words[nextTheme[theme]];
  return (
    <button type="button" className={cls} onClick={store.cycle} aria-label={ariaLabel}>
      {label}
    </button>
  );
}
