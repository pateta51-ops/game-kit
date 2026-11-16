import type { Linter } from 'eslint';

export interface CowOptions {
  state?: string[];
  owned?: string[];
  inPlace?: string[];
  depth?: number;
  message?: string;
}
export interface EngineLintOptions {
  engine?: string;
  api?: string;
  pure?: string[];
  callers?: string[];
  allowImports?: string[];
  forbidImports?: string[];
  cow?: CowOptions | false;
  cardPrefixes?: string[];
  cardFiles?: string[];
}
export interface Selector {
  selector: string;
  message: string;
}
export function cowSelectors(options?: CowOptions): Selector[];
export function cardIdSelectors(prefixes: string[], message?: string): Selector[];
export function prefixDrift(lintPrefixes: string[], registryPrefixes: string[]): string[];
export function engineLint(options?: EngineLintOptions): Linter.Config[];
