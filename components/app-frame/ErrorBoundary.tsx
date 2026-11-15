// Catches what its children throw while they draw (or a lazy screen whose code cannot be fetched) and draws the
// fallback instead; retry draws the children again. React still reports the error in the console.
import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  fallback: (error: Error, retry: () => void) => ReactNode;
  onError?: ((error: Error, info: ErrorInfo) => void) | undefined;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const asError = (t: unknown): Error => (t instanceof Error ? t : new Error(typeof t === 'string' ? t : 'Unknown error'));

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(t: unknown): State {
    return { error: asError(t) };
  }

  override componentDidCatch(t: unknown, info: ErrorInfo): void {
    this.props.onError?.(asError(t), info);
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    return this.state.error === null ? this.props.children : this.props.fallback(this.state.error, this.retry);
  }
}
