import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

/**
 * jsdom does not implement matchMedia. Every browser does, so this is a gap in
 * the test environment rather than something the app should defend against.
 */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
