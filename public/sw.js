/* eslint-env serviceworker */

/**
 * App-shell caching.
 *
 * Shell caching and data caching are deliberately independent. The service
 * worker only guarantees the app *opens* with no connection; what it then shows
 * comes from IndexedDB, which the app manages itself. Keeping them separate
 * means a shell update can never drop a downloaded boarding pass.
 */

const VERSION = 'v2';
const SHELL_CACHE = `marching-orders-shell-${VERSION}`;

/** Resolves against the registration scope, so the GitHub Pages subpath works. */
const scoped = (path) => new URL(path, self.registration.scope).toString();

const SHELL = ['', 'index.html', 'manifest.webmanifest', 'icon.svg'].map(scoped);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // `cache: 'reload'` bypasses the HTTP cache. Without it a stale index.html
      // can be precached and then served indefinitely, pinning users to an old
      // build that no amount of reloading clears.
      await Promise.all(
        SHELL.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) await cache.put(url, response);
          } catch {
            // A shell entry that cannot be fetched at install time is not fatal;
            // the runtime handler will fill it in later.
          }
        }),
      );
      // Deliberately *not* skipWaiting here. Activating immediately would swap
      // the assets underneath a page that is already running, which breaks lazy
      // chunks mid-navigation. The new worker waits until the app asks, which
      // it does only when the user accepts the update.
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'apply-update') void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('marching-orders-shell-') && name !== SHELL_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Drive and Google auth must never be served from cache: a stale file listing
  // or a cached token response would be worse than an honest network failure.
  if (url.origin !== self.location.origin) return;

  // Navigations fall back to the cached shell, which is what lets the app open
  // in airplane mode. It is a single-page app, so any route resolves to it.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(scoped('index.html'))) ??
            (await cache.match(scoped(''))) ??
            Response.error()
          );
        }
      })(),
    );
    return;
  }

  /*
   * Only content-hashed files may be served cache-first.
   *
   * A hashed name is a promise that the bytes never change, so a cached hit is
   * always right and a new build simply asks for new URLs. Everything else —
   * icons, the manifest, anything dropped in public/ — keeps its name forever,
   * and cache-first meant those could never be updated at all. That is how a
   * new app icon stayed invisible after a successful deploy.
   */
  const immutable = /\/assets\/.+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(url.pathname);

  if (immutable) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          await cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  /*
   * Everything else is served from cache for speed and for offline, and
   * refreshed in the background so the next load has the new bytes. A stable
   * name has to stay correctable.
   */
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);

      const fetching = fetch(request)
        .then(async (response) => {
          if (response.ok && response.type === 'basic') {
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      // Offline with nothing cached is the only case with nothing to return.
      return cached ?? (await fetching) ?? Response.error();
    })(),
  );
});
