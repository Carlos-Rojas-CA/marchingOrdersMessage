import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import { ServicesProvider } from '../hooks/useServices';
import { TripShell } from '../components/TripShell';
import { FakeDriveClient } from '../lib/drive/fakeDriveClient';
import { ITINERARY_FILENAME } from '../lib/sync/syncEngine';

export const FOLDER = 'folder-1';

export interface SeedDocument {
  /** Placeholder used inside the itinerary; rewritten to the real Drive id. */
  id: string;
  name: string;
  mimeType?: string;
  content?: string;
}

/** Rewrites placeholder driveFileIds to the ids Drive actually handed back. */
function remapIds(value: unknown, ids: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => remapIds(item, ids));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        key === 'driveFileId' && typeof inner === 'string'
          ? (ids.get(inner) ?? inner)
          : remapIds(inner, ids),
      ]),
    );
  }
  return value;
}

async function seedDrive(
  itinerary: Record<string, unknown>,
  documents: SeedDocument[],
): Promise<FakeDriveClient> {
  const drive = new FakeDriveClient();

  // Files first, then the itinerary referencing the ids Drive assigned — the
  // same order a real upload produces.
  const ids = new Map<string, string>();
  for (const document of documents) {
    const file = await drive.uploadFile({
      folderId: FOLDER,
      name: document.name,
      mimeType: document.mimeType ?? 'application/pdf',
      content: new Blob([document.content ?? '%PDF-1.4']),
    });
    ids.set(document.id, file.id);
  }

  drive.seedJson(FOLDER, ITINERARY_FILENAME, remapIds(itinerary, ids));
  return drive;
}

interface Options {
  itinerary: Record<string, unknown>;
  documents?: SeedDocument[];
}

/**
 * Renders one of the three lenses inside the real `TripShell`.
 *
 * Everything below the UI is real — the store, the sync engine, the model. Only
 * Drive is substituted, so a passing test says something about the app rather
 * than about its mocks.
 */
export async function renderLens(
  element: ReactElement,
  { itinerary, documents = [] }: Options,
): Promise<RenderResult & { drive: FakeDriveClient }> {
  const drive = await seedDrive(itinerary, documents);

  const result = render(
    <ServicesProvider
      drive={drive}
      storeName={`test-${Math.random().toString(36).slice(2)}`}
      fallback={<p>Loading…</p>}
    >
      <MemoryRouter initialEntries={[`/trip/${FOLDER}`]}>
        <Routes>
          <Route path="/trip/:folderId" element={<TripShell />}>
            <Route index element={element} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ServicesProvider>,
  );

  return Object.assign(result, { drive });
}

/** Renders the full-screen document viewer for one file. */
export async function renderViewer(
  element: ReactElement,
  { itinerary, documents = [], fileName }: Options & { fileName: string },
): Promise<RenderResult & { drive: FakeDriveClient }> {
  const drive = await seedDrive(itinerary, documents);
  const file = (await drive.listFolder(FOLDER)).find((f) => f.name === fileName);
  if (!file) throw new Error(`No seeded document named ${fileName}`);

  const result = render(
    <ServicesProvider
      drive={drive}
      storeName={`test-${Math.random().toString(36).slice(2)}`}
      fallback={<p>Loading…</p>}
    >
      <MemoryRouter initialEntries={[`/trip/${FOLDER}/doc/${file.id}`]}>
        <Routes>
          <Route path="/trip/:folderId/doc/:fileId" element={element} />
        </Routes>
      </MemoryRouter>
    </ServicesProvider>,
  );

  return Object.assign(result, { drive });
}
