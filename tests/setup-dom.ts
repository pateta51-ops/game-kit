import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Setup of the `ui` Vitest project (jsdom): jest-dom matchers, and a clean document after every test.
window.scrollTo = () => undefined;
afterEach(() => {
  cleanup();
});
