/**
 * Vitest setup — referenced by vite.config.ts test.setupFiles.
 * Extends expect with jest-dom matchers (toBeInTheDocument, …).
 * Tests themselves are written/run by the Test Engineer.
 *
 * jsdom lacks a few browser APIs that @base-ui/react (dialogs/radios),
 * the design system's motion and the PhotoGallery rely on. Deterministic
 * stubs — no timers, no async, no network.
 */
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import '@testing-library/jest-dom/vitest';

// vitest runs with `globals: false`, so @testing-library/react cannot
// auto-register its afterEach cleanup — without this, rendered DOM piles up
// between tests in a file and queries hit stale/multiple elements.
afterEach(() => cleanup());

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: ResizeObserverStub,
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(window, 'scrollTo', {
  writable: true,
  configurable: true,
  value: () => {},
});
