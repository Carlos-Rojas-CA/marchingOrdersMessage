# Trip Itinerary — Design Spec

**Date:** 2026-09-12
**Status:** Approved for planning
**Author:** Carlos Rojas (with Claude)

## 1. Problem

Trip logistics currently live in a Google Doc: boarding passes, hotel
confirmations, train tickets, points of interest, and notes, pasted in by hand.
This works for authoring but fails at the moment of use — standing in an airport
or a train station, on a bad connection or none at all, scrolling a long document
to find the one PDF that matters.

The documents themselves are already fine where they are. The gap is
presentation and availability: a structure that knows what happens when, a way
to reach a specific document immediately, and a copy on the phone that works
with the radio off.

## 2. Goals

1. Present a trip as a day-by-day timeline, with documents and locations
   attached to the events they belong to.
2. Get to any document — boarding pass, hotel confirmation, train ticket — in
   one or two taps, without needing to know which day it belongs to, and display
   it in a form that is actually usable at a gate or a front desk.
3. Make a full trip available offline, on purpose and under user control —
   not as an unpredictable cache.
4. Keep Google Drive as the system of record, so sharing a trip is sharing a
   Drive folder and nothing else has to be managed.
5. Feel instant. Every interaction is local-first; the network is never in the
   path of a render or an edit.

### Non-goals (v1)

Deliberately excluded to keep the first version shippable:

- Offline editing. Offline is read-only.
- Concurrent multi-writer editing (see §9).
- Offline map tiles. Locations are text + a link out (see §8).
- Email-forwarding / automatic booking import.
- A native iOS app. Revisit only if the PWA proves limiting (§13).
- Expenses, currency conversion, comments, notifications.

## 3. Users and context

Personal and household use. A handful of trips per year, one to three people per
trip, tens of items per trip — not thousands. This scale justifies simple
approaches (load the whole trip into memory, render the whole list) that would
be wrong at larger scale, and the design takes advantage of it.

The critical usage moment is a phone, possibly roaming or in airplane mode,
opened one-handed under time pressure.

## 4. Architecture

A static Progressive Web App talking directly to the Google Drive API. No
backend, no database, no server to operate or pay for.

```
┌─────────────────────────────────────────┐
│  PWA (static files on GitHub Pages)     │
│                                         │
│  React UI                               │
│      ↕ (always, synchronously)          │
│  IndexedDB  ← the render source         │
│      ↕ (background, never blocking)     │
│  Sync engine                            │
└──────────────────┬──────────────────────┘
                   │ HTTPS + OAuth
                   ↓
         ┌─────────────────────┐
         │  Google Drive       │
         │  <Trip Folder>/     │
         │    itinerary.json   │
         │    boarding-pass.pdf│
         │    hotel-conf.pdf   │
         └─────────────────────┘
```

### The central rule

**IndexedDB is what the UI reads. Drive is what IndexedDB syncs with.**

The UI never awaits a network call to paint, and never awaits one to
acknowledge an edit. This single rule is what prevents the sluggishness seen in
comparable apps, and every other performance decision follows from it.

### Stack

Matching the existing `pdp-project-fe` toolchain:

| Concern | Choice | Notes |
|---|---|---|
| Framework | React 19 + Vite + TypeScript | Familiar; meets budget if disciplined |
| Styling | Tailwind 4 + shadcn/radix | Familiar |
| Schema/validation | zod | Validates `itinerary.json` at the trust boundary |
| Forms | react-hook-form | Item add/edit form |
| Local storage | IndexedDB via `idb` | ~2 KB wrapper |
| State | Small store + `useSyncExternalStore` | See below |
| Tests | vitest + Playwright | |

**Not using react-query**, despite it being in the sibling project. It models
"server is the truth, cache is derived." Here the local store is the truth and
the server is a peer being reconciled with. A thin store subscribed to IndexedDB
and read via `useSyncExternalStore` matches the actual data flow; react-query
would fight it.

## 5. Module boundaries

Each module has one job, a defined interface, and is testable alone.

```
lib/
  auth/     Google Identity Services wrapper. Access tokens, silent re-auth.
            Knows nothing about Drive semantics or itineraries.

  drive/    DriveClient interface + GoogleDriveClient + FakeDriveClient.
            Raw file operations: list, get metadata, download, upload, delete.
            Knows nothing about itineraries.

  model/    Itinerary schema (zod), validation, migration, merge, and derived
            views (group items into days, group attachments by docType).
            Pure functions. No I/O at all.

  store/    IndexedDB schema and repositories. Knows nothing about Drive.

  sync/     Orchestrates drive ↔ store. The ONLY module aware of both.

routes/     UI. Reads from store. Never imports lib/drive directly.
```

The `DriveClient` interface with a fake implementation is the key testability
decision: all sync and reconciliation logic is tested without a network or a
Google account.

## 6. Data model

### Drive folder layout

Flat, one folder per trip:

```
Japan 2026/                  ← the unit of sharing
  itinerary.json             ← structure and metadata
  aa123-boarding-pass.pdf
  park-hyatt-confirmation.pdf
  shinkansen-ticket.pdf
```

Flat rather than nested so a single `files.list` call retrieves everything —
one request instead of two, which matters on a cold open over a slow link. The
folder also stays legible to a human who opens it in Drive directly.

Each uploaded file carries Drive `appProperties` tagging it with its
`tripId`/`itemId`. This is redundant with `itinerary.json` by design: if that
file is ever lost or corrupted, the trip can be rebuilt from the folder.

### `itinerary.json`

```jsonc
{
  "schemaVersion": 1,
  "tripId": "uuid",
  "name": "Japan 2026",
  "startDate": "2026-09-12",
  "endDate": "2026-09-24",
  "updatedAt": "2026-09-12T10:00:00Z",
  "updatedBy": "c2rojas75@gmail.com",

  // Trip-level documents belonging to no single event: passports,
  // visas, insurance. Same attachment shape as items carry.
  "attachments": [
    { "driveFileId": "9x8y7z", "name": "passport-carlos.pdf",
      "mimeType": "application/pdf", "docType": "identity",
      "label": "Carlos — passport" }
  ],

  "items": [
    {
      "id": "uuid",
      "type": "flight",          // flight|lodging|train|activity|poi|note|document
      "title": "AA123 SFO→NRT",
      "startsAt": "2026-09-12T08:00:00-07:00",  // ISO 8601 with offset
      "endsAt":   "2026-09-13T14:00:00+09:00",
      "confirmationNumber": "ABC123",
      "notes": "Aisle seat requested",
      "location": {
        "name": "San Francisco International Airport",
        "address": "San Francisco, CA 94128",
        "lat": 37.6213,
        "lng": -122.3790
      },
      "attachments": [
        { "driveFileId": "1a2b3c", "name": "boarding-pass.pdf",
          "mimeType": "application/pdf",
          "docType": "boardingPass",   // see §7
          "label": "Carlos — seat 14A" // disambiguates siblings
        }
      ],
      "updatedAt": "2026-09-12T10:00:00Z",
      "updatedBy": "c2rojas75@gmail.com",
      "deleted": false
    }
  ]
}
```

Two decisions worth stating explicitly:

**Days are derived, never stored.** Items carry a timestamp; the UI groups them
into days. Storing a day assignment alongside a date invites the two to
disagree, and there is no way to tell which is right. Items with no timestamp
group into an "Unscheduled" bucket. Timestamps carry UTC offsets so a flight
crossing the date line renders correctly at both ends.

**The schema is merge-ready from day one**, even though v1 never merges. Every
item has a stable `id`, its own `updatedAt`, and a `deleted` tombstone flag
rather than being removed from the array. This costs nothing now and means
adding multi-writer merge later (§9) is a contained change instead of a
migration.

### IndexedDB stores

| Store | Key | Contents |
|---|---|---|
| `trips` | `driveFolderId` | Name, dates, `itineraryFileId`, `lastSyncedAt`, `canEdit`, offline-enabled flag |
| `itineraries` | `tripId` | Parsed doc + `driveModifiedTime` + `driveVersion` |
| `attachments` | `driveFileId` | Metadata + `docType` + `md5Checksum` + `Blob` (null until downloaded). `itemId` is nullable for trip-level documents. |
| `outbox` | auto | Pending writes: `{ tripId, type, payload, attempts, lastError }` |

Attachment blobs live in IndexedDB rather than Cache Storage so the app can
enumerate them, total their size, and evict them deliberately — all needed for
the offline UX in §10.

## 7. Views: getting to a document fast

The timeline answers "what happens when." It does not answer "where is my
boarding pass," which is the question actually being asked at a gate. The same
trip is therefore presented through three lenses over one dataset — no
duplicated data, only different groupings, all derived by pure functions in
`lib/model`.

### Now — the default landing during a trip

Opens straight to what is in play: the next departure with its boarding pass one
tap away, tonight's lodging with address and confirmation number. Outside trip
dates it falls back to the trip list. This is the shortest path from lock screen
to the thing being scanned, and it requires no new data — just a filter over
items by time.

### Timeline

Day-by-day, as described in §6. Planning, orientation, "what's tomorrow."

### Documents

Every attachment in the trip, grouped by kind rather than by date:

```
  Boarding passes (3)
    Carlos — AA123 SFO→NRT · seat 14A
    …
  Hotel confirmations (2)
  Train & transit tickets (4)
  Tickets & reservations (2)
  Travel documents (3)          passports, visas, insurance
  Other (1)
```

Reachable in one tap from anywhere. This is the primary view when you know what
kind of document you need but not which day it belongs to.

`docType` values: `boardingPass | ticket | confirmation | voucher | identity |
insurance | other`.

**`docType` is inferred from the parent item's type on upload** — flight →
`boardingPass`, lodging → `confirmation`, train → `ticket` — and can be
overridden. Nothing has to be hand-categorized for the grouping to be useful.
That matters because categorizing happens calmly while packing, and retrieval
happens under stress; the design must not depend on past-you having been
diligent.

### Document viewer

Opening a document is the moment the app exists for, so it gets deliberate
treatment rather than a generic PDF frame:

- **Full screen, no chrome.** Pinch-zoom, rotate, landscape.
- **Screen wake lock** (`navigator.wakeLock`, supported in Safari 16.4+) while a
  document is open, so the phone does not sleep while queuing at a gate.
- **Key fields hoisted above the document** as large selectable text:
  confirmation number, record locator, seat, address. Reading a code aloud or
  typing it into a kiosk should never require zooming into a PDF.
- **Swipe between documents in the same group**, so three boarding passes for
  three travelers are three swipes rather than three round trips through a menu.

**One acknowledged limitation:** the web cannot raise screen brightness, which
matters when a gate scanner reads a dim barcode. There is no workaround inside a
PWA. This is the most concrete argument for an eventual native app (§13); until
then the wake lock plus the user's own brightness control is the honest answer,
and it should be stated in the UI rather than left as a surprise.

## 8. Locations

Each item may carry a location with name, address, and coordinates, captured via
Google Places autocomplete when online.

Offline, the app shows name, address, and coordinates as text, plus a copyable
`lat,lng`. An "Open in Maps" button hands off to the native maps app, which
works when there is connectivity.

No map tiles are rendered, offline or online. Offline tile caching requires a
maps SDK, a tile budget, and licensing considerations, and it earns very little:
the address and the handoff cover the actual need ("where am I going, get me
there"). This is a deliberate trade and can be revisited with evidence.

## 9. Sync and collaboration

### Read path

1. App opens. Trip renders from IndexedDB. **No network call in this path.**
2. In the background, if online: one `files.list` on the trip folder, requesting
   only `id,name,mimeType,modifiedTime,md5Checksum,size,appProperties`. A
   typical trip returns 2–5 KB.
3. If `itinerary.json`'s `modifiedTime` is newer than cached, download it
   (single-digit KB) and update the store. React re-renders the delta.
4. Attachment blobs are **not** fetched here. Checksums are compared so the UI
   can mark a cached document as stale, but bytes move only on user action (§10).

A refresh therefore costs a few kilobytes, not megabytes. "Constantly fetching
from Drive" is not the cost to avoid; re-downloading blobs is, and this design
does not do that.

### Write path

1. User edits. The change applies to the in-memory doc and IndexedDB, and the UI
   re-renders. Target: under 50 ms, no network involved.
2. The change is enqueued in the outbox.
3. A debounced flusher (~2 s) coalesces pending edits into a single upload of the
   current document. Rapid edits produce one request, not one per keystroke.
4. On failure: exponential backoff, and a persistent "N changes not synced"
   indicator. Nothing is lost — the outbox survives a reload.

Editing is disabled while offline, with a clear explanation rather than a
silently failing button. The outbox still exists for the online-but-flaky case.

### Concurrency: single-writer in v1

Two people saving `itinerary.json` at once means last-write-wins, and someone
silently loses work. On a trip that is a bad failure.

**v1 enforces one writer using Drive's own permissions.** One person holds
Editor; everyone else is Viewer. Google enforces it; the app writes no locking
code. Viewers get the complete read and offline experience. The app reads
`capabilities.canEdit` from Drive and hides editing affordances for viewers
rather than letting them fail.

As a safety net, writes are compare-and-swap: the app re-reads the file's
`version` before uploading, and if it changed unexpectedly it **refuses to
overwrite**, surfacing a "changed elsewhere — reload" banner. Preserving the
other party's data beats preserving ours.

**Deferred, not designed away:** when a second writer is actually needed, the
merge-ready schema (§6) makes it a per-item last-writer-wins merge — roughly a
50-line pure function over two documents, plus tests. It is built when a real
second writer appears.

### Sharing

"Share this trip" hands off to Drive's own sharing UI for the folder. No
invitation system, no user accounts, no permissions model to build or secure.

## 10. Offline

### Explicit download, not implicit caching

Each trip has an **"Available offline"** toggle showing what it will cost:

```
  Available offline          [ ●─ ]
  18 documents · 14.2 MB · updated 2 hours ago
```

Turning it on downloads every attachment with cancellable progress. Downloads
are per-file, so an interruption simply leaves some files cached and the rest
retrievable later. Turning it off frees the space.

This is explicit because the usage context is international roaming. Bytes move
when the user says so — ideally on hotel wifi the night before — never as a
surprise.

Approximate costs, for calibration:

| | Size | Frequency |
|---|---|---|
| Metadata refresh | 2–5 KB | Per app open / manual refresh |
| Full trip documents | 10–20 MB | Once, then only changed files |

### App shell

A service worker precaches the app shell, so the PWA launches instantly even
with no connection. Shell caching and data caching are independent: the app
always opens, then shows whatever data it has.

### The iOS eviction risk

**This is the most significant practical risk in the design.** iOS Safari may
evict site data after roughly seven days of non-use. Home-screen-installed PWAs
are exempt; a page merely visited in Safari is not.

Mitigations, all required:

1. The app calls `navigator.storage.persist()` to request durable storage.
2. If not running in standalone display mode, it shows a dismissible banner
   explaining that Add to Home Screen is necessary for reliable offline access —
   stated plainly as a requirement, not buried as a suggestion.
3. On each online open it verifies cached blobs still exist and silently
   re-downloads any that vanished.
4. `navigator.storage.estimate()` is checked before a download; the user is
   warned if quota is tight rather than failing mid-download.

## 11. Auth and permissions

Google Sign-In via Google Identity Services, browser-side, PKCE. There is no
client secret — only a public client ID, which is why the repository can be
public (§14).

**Scope: `drive.file` only.** This grants access solely to files the app creates
or the user explicitly picks through the Google Picker. The rest of the user's
Drive is unreachable by the app — a meaningful safety property, and it avoids
Google's heavyweight verification review that full `drive` scope triggers.

Access tokens last about an hour. Re-auth is silent while a Google session
exists. Offline use requires no token at all, since the data is local.

### Open risk — resolve first

**Whether picking a folder under `drive.file` also grants access to files that
collaborators later add to that folder through Drive's own web UI.**

- If yes: sharing works as described throughout this spec.
- If no: the rule becomes "files must be added through the app, not dropped into
  Drive directly," and the app must say so prominently.

This changes how sharing feels but not the architecture. **It is the first task
in the implementation plan** — a throwaway ~30-minute probe, before any UI is
built. A second item to confirm at the same time: that publishing an app with
only the non-sensitive `drive.file` scope does not require verification review.

## 12. Performance

Treated as a requirement with numbers, not an aspiration.

### Budget

| Metric | Target |
|---|---|
| Launch to itinerary visible (installed, offline) | < 500 ms |
| Store read → rendered itinerary | < 300 ms |
| Tap a document → first page visible (cached) | < 400 ms |
| Any user edit reflected in UI | < 50 ms |
| Initial JS bundle (gzipped) | < 150 KB |
| Typical refresh payload | < 10 KB |

### Rules that enforce it

- **No network call in the initial render path.** The single most important one.
- **No network call in the edit path.** Optimistic local write; sync follows.
- Route-level code splitting; the item editor is not in the initial bundle.
- **pdf.js is lazy-loaded on first PDF open**, never at startup. iOS Safari
  renders PDFs in iframes unreliably, so a real renderer is needed — but it costs
  nothing until a document is actually opened, after which the service worker
  caches it.
- The three views in §7 are pure derivations over already-loaded data. Switching
  lenses touches no storage and no network.
- Images are served from object URLs over cached blobs, not re-fetched.
- **No virtualization initially.** Trips have tens of items; a virtualized list
  would add complexity and jitter for no measured gain. Revisit only with a
  profile showing a problem.
- Bundle size is asserted in CI (§15), so regressions fail the build rather than
  accumulating quietly.

## 13. PWA now, native later

v1 ships as a PWA. A native iOS app is built only if the PWA proves genuinely
limiting in practice. The concrete candidates, in rough order of likelihood:

- **Screen brightness control** for barcode scanning (§7) — unavailable to web
  code, and the limitation most likely to be felt at a gate.
- **iOS share-sheet integration**, saving a PDF from Mail straight into a trip.
- **Apple Wallet** passes for boarding passes.
- Background sync.

The architecture does not obstruct this: `lib/model`, `lib/drive`, `lib/store`,
and `lib/sync` are UI-independent TypeScript, reusable by React Native. Only
`routes/` is web-specific. No further upfront cost is paid for a native app that
may never be built.

## 14. Hosting and repository

- **Repository:** `Carlos-Rojas-CA/marchingOrdersMessage`, separate from
  `Carlos-Rojas-CA.github.io`, published to
  `carlos-rojas-ca.github.io/marchingOrdersMessage/`. Independent deploys and
  history.
- **Public is correct and free.** GitHub Pages from a private repo requires a
  paid plan, and there is nothing to hide: the OAuth client ID is public by
  design, no client secret exists, and all user data lives in Drive. The
  repository contains only application code.
- Vite `base` must be set to the repository subpath, and the service worker
  scope must match.

## 15. Testing

| Layer | Tool | Coverage |
|---|---|---|
| Pure logic | vitest | Schema validation and migration, day grouping, `docType` inference and grouping, timezone/date-line handling, merge function |
| Sync | vitest + `FakeDriveClient` | Reconciliation, conflict detection, outbox retry and coalescing — no network |
| Components | vitest + Testing Library | The three views, document viewer states, read-only mode, offline states |
| End-to-end | Playwright | Offline reload, download-for-offline with interruption, open a boarding pass offline, auth expiry |
| Performance | Lighthouse CI + bundle-size assertion in GitHub Actions | §12 budget enforced per PR |

The merge function is written and tested in v1 even though nothing calls it. It
is pure, cheap to test, and it is the piece most likely to be written under
pressure later.

## 16. Error handling

| Condition | Behavior |
|---|---|
| Offline | "Offline — showing saved data" banner. Editing disabled with explanation. |
| Document not cached, offline | Viewer says so explicitly and names the document, rather than showing a blank frame. |
| Token expired | Silent re-auth. If that fails, prompt sign-in while preserving unsaved local state. |
| Drive rate-limited (403) | Exponential backoff; sync indicator shows retrying. Reads keep working from cache. |
| Upload failed | Stays in outbox; "N changes not synced" indicator; retried automatically. |
| Conflict (version changed) | Refuse to overwrite. Banner offering "Reload from Drive". |
| `itinerary.json` missing or corrupt | Offer rebuild from folder contents using `appProperties`. Never silently discard. |
| Quota exceeded | Warn before download begins; report which files were not cached. |

## 17. Implementation phases

1. **Spike — resolve §11's open question.** Verify `drive.file` + Picker folder
   access semantics and scope-verification requirements. Throwaway code.
   *Gates everything else.*
2. **Skeleton.** Vite + React + Tailwind + PWA manifest + service worker shell.
   Deploys to Pages. Auth working. Pick a folder, read `itinerary.json`, store in
   IndexedDB, render the read-only Timeline.
3. **Views and viewer.** The Documents lens, the Now lens, and the full-screen
   document viewer with wake lock, hoisted key fields, and swipe between
   siblings. Together with phase 2 this fully replaces the Google Doc.
4. **Editing.** Add/edit/delete items, attach files with `docType` inference,
   outbox, optimistic writes, compare-and-swap conflict detection.
5. **Offline.** Download-for-offline with progress and cancellation, storage
   estimation, install banner, offline detection and read-only enforcement.
6. **Sharing and polish.** Drive sharing handoff, read-only viewer mode, empty
   and error states, Lighthouse/bundle budgets in CI.

Phases 2–3 together are the point of the project: reading a trip well. Editing
can lag behind, because a trip can be authored once in the existing Google Doc
workflow and still be read here.

Phases get their own implementation plans rather than one plan spanning all six
— phase 1's findings may adjust phase 2, and a plan written now for phase 6
would be guesswork.

## 18. The trip builder

Approved 2026-09-12. Guided setup in the order trips are actually planned,
free-form afterwards.

1. **Name and dates.** Dates bound everything; both kinds of gap below are
   measured against them.
2. **Route.** Places and **nights** — not dates. Dates are derived, so changing
   one stop cascades through every later one. That is the arithmetic people get
   wrong on paper and retype an itinerary to fix. Skippable; one row for a trip
   that stays put.
3. **Flights out and back.** The only items carrying two different zones.
4. **Legs.** Each stay, plus the moves between them.
5. **Free-form day view** with a type-scoped add sheet.

### Legs are derived, never stored

A stay in Rome from the 9th to the 13th *is* the statement "you are in Rome for
those nights", so `legsFromStays` reads the route back off the itinerary rather
than keeping a second copy that could drift. The route screen writes ordinary
stays; it is a sketching aid, not a parallel model.

Two warnings fall out of that for free:

- **Bed gaps** — nights inside the trip with nowhere to sleep. A night crossing
  midnight on a flight or train counts as covered: a warning that fires on a
  red-eye is noise, and noise is how warnings stop being read.
- **Transition gaps** — consecutive stays in different cities with nothing
  booked to move you between them. On a multi-country trip this is the mistake
  that actually happens: every hotel booked, one train forgotten.

Neither blocks anything. Both are stated and moved past.

### Time zones are derived, never typed

A traveller types the time printed on their booking and names the place. The
offset comes from the place **and the date**, via the browser's own time zone
database — so daylight saving is right, half-hour zones work, and there is no
table here to go stale when a country changes its rules.

Resolution order, first hit wins:

1. A place picked on the item
2. A city recognised inside an address that was typed
3. Which leg the date falls in
4. The last place used

Rule 2 declines rather than guesses when nothing is recognisable, because a
wrong guess silently shifts a time and the later rules can answer instead.

Worth recording: Italy, Spain, France and Germany are all one zone, so a
four-country European trip needs none of this. It earns its keep crossing into
the UK, Greece, or flying home.

### Deferred

Drag to reschedule; an airport database beyond the codes already listed;
per-traveller itineraries; currency; visa checks.

## 19. Open questions

1. §11's scope question. Resolved by phase 1 before anything is built on it.
2. Whether large photo attachments should be downscaled on upload. Deferred until
   there is evidence of a real trip hitting storage limits.
3. Whether one shared folder holding many trips is preferable to one folder per
   trip. Per-trip is specified because it makes sharing granular; revisit if
   managing many folders becomes tedious.
