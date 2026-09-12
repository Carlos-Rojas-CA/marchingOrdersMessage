import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

/**
 * Smoke test of the real composition root.
 *
 * Everything is the production wiring — bootstrap, the store, the sync engine,
 * routing — with only Drive replaced by the in-memory fake that demo mode
 * seeds. If this passes, the app genuinely starts.
 */
describe('App in demo mode', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEMO', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function renderApp() {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
  }

  test('boots and lists the seeded trip', async () => {
    renderApp();

    expect(await screen.findByText('Japan 2026', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  test('opens a trip and lands on Now', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(await screen.findByText('Japan 2026', {}, { timeout: 5000 }));

    // Now is the default lens during a trip.
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /documents/i })).toBeInTheDocument(),
    );
  });

  test('reaches the documents lens and groups what it finds', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(await screen.findByText('Japan 2026', {}, { timeout: 5000 }));
    await user.click(await screen.findByRole('link', { name: /documents/i }));

    // The flight's boarding pass and the shinkansen ticket now share one
    // heading, which is the point of the regrouping.
    expect(await screen.findByRole('heading', { name: /Flights, trains & ferries/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Hotels & stays/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Travel documents/ })).toBeInTheDocument();
  });

  test('shows the whole trip on the timeline', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(await screen.findByText('Japan 2026', {}, { timeout: 5000 }));
    await user.click(await screen.findByRole('link', { name: /timeline/i }));

    expect(await screen.findByText('AA123 SFO → NRT')).toBeInTheDocument();
    expect(screen.getByText('Park Hyatt Tokyo')).toBeInTheDocument();
  });
});
