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

/**
 * jsdom implements no layout, so it has no IntersectionObserver either. The
 * timeline uses one to track which day is on screen; a stub keeps that code
 * running, and the behaviour it drives is only observable with a real viewport
 * anyway.
 */
if (!('IntersectionObserver' in window)) {
  // Not typed as implementing the interface: the DOM lib's definition grows
  // members over time, and a stub that has to track them is a maintenance
  // cost for no benefit.
  class StubObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: StubObserver,
  });
}

/**
 * jsdom has no layout, so it implements no scrolling either.
 *
 * Both the place field and the day strip scroll things into view — behaviour
 * that only means anything with a real viewport, but which throws here
 * without a stand-in.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
