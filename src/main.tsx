import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

/*
 * Self-hosted so the app keeps its typography on a plane; the service worker
 * caches them with everything else.
 *
 * Archivo for display and times — a signage grotesque. Barlow for everything
 * else: drawn from California highway and transit lettering, which is exactly
 * the job this app does. Read fast, one-handed, in bad light.
 *
 * Imported here rather than from the stylesheet so Vite emits the font files;
 * see the note in styles.css.
 */
import '@fontsource-variable/archivo';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';

/**
 * Asks the browser to treat this origin's storage as durable.
 *
 * On iOS, data for a site that has not been used for about a week can be
 * evicted — which for this app means a boarding pass disappearing the day
 * before it is needed. Installing to the home screen is the real protection;
 * this is the part the page itself can do.
 */
async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage?.persist) return;
  try {
    if (await navigator.storage.persisted()) return;
    await navigator.storage.persist();
  } catch {
    // Advisory only — a refusal changes nothing about how the app runs.
  }
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    });
  });
}

void requestPersistentStorage();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
