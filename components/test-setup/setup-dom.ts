// List this file in a game's vitest `setupFiles` (jsdom project): `setupFiles: ['kit/test-setup/setup-dom.ts']`.
// For sizes or matchMedia answers call `installDomStubs({...})` from the game's own setup file instead.
import { installDomStubs } from './dom.ts';

installDomStubs();
