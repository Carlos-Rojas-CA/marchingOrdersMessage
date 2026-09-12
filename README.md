# Marching Orders

Your trip documents, ready offline.

A trip lives in a Google Drive folder: boarding passes, hotel confirmations,
train tickets, and an `itinerary.json` describing what happens when. This app
presents that folder as something usable at a gate — and keeps a copy on your
phone that works with the radio off.

Sharing a trip is sharing the Drive folder. There is no account system, no
server, and no database.

## The three lenses

One dataset, three ways in:

| Lens | Answers |
|---|---|
| **Now** | What is happening right now, and what is next |
| **Timeline** | The trip day by day |
| **Documents** | Where is my boarding pass — grouped by kind, not by date |

The Documents lens exists because the timeline answers the wrong question at an
airport. Documents are grouped as boarding passes, tickets, confirmations and
travel documents, and the grouping is **inferred from the item they hang off** —
a flight implies a boarding pass, a hotel implies a confirmation. Nothing has to
be hand-categorised, because categorising happens calmly while packing and
retrieval happens under stress.

## Design decisions worth knowing

**Reads never wait on the network.** IndexedDB is what the UI renders from;
Drive is a peer reconciled with it in the background. A refresh costs one folder
listing plus at most one small JSON download — kilobytes, not megabytes.

**Downloading is a decision, not a background behaviour.** Each trip has an
explicit toggle showing what it will cost before a byte moves. The usage context
is international roaming, so this is the traveller's call, ideally made on hotel
wifi the night before.

**One writer per trip.** v1 uses Drive's own permissions as the lock: one
Editor, everyone else Viewer. A write that finds Drive changed underneath it
refuses rather than overwriting. The schema carries per-item ids, timestamps and
tombstones from day one, so real merging is a contained addition later — the
merge function is already written and tested, just not called.

**Times are shown as written, in the place they happen.** A check-in at
`18:00+09:00` reads "6:00 PM" to someone standing in Tokyo. Nothing is converted
through the device's timezone.

**Install it to the home screen.** iOS can clear stored data for a site unused
for about a week; installed apps are exempt. On the target platform this is what
stands between a saved boarding pass and an empty screen.

## Running it

```bash
npm install
npm run dev               # real Drive; client id comes from .env
VITE_DEMO=1 npm run dev   # sample trip, in-memory Drive, no credentials
```

Demo mode runs the entire app against the same in-memory Drive the tests use —
no Google account, no network, no quota. It is the fastest way to see the app.

```bash
npm test                  # 154 tests
npm run typecheck
npm run build
```

## Configuration

The OAuth client id lives in the committed `.env`. Nothing else is needed to
build or run.

It is committed deliberately: a client id is not a secret — it ships inside the
JavaScript bundle of every browser-based OAuth app, so anyone opening the site
can read it. What protects the app is the **Authorized JavaScript origins** list
on that client in Google Cloud Console; a request from an unregistered origin is
refused regardless of who holds the id.

Origins to register:

```
http://localhost:5178          # npm run dev
https://carlos-rojas-ca.github.io   # deployed
```

There is no client secret anywhere in this project — the browser uses PKCE,
which has none. If Google generated one alongside the id, leave it unused.
Anything genuinely private goes in `.env.local`, which is gitignored.

**Scope: `drive.file` only.** The app can reach files it created or that you
explicitly picked, and nothing else in your Drive. This also keeps it clear of
the third-party security assessment that the full `drive` scope can trigger.

## Architecture

```
src/lib/
  model/   Schema, day grouping, document grouping, merge. Pure, no I/O.
  drive/   DriveClient interface + Google implementation + in-memory fake.
  store/   IndexedDB. Knows nothing about Drive.
  sync/    Reconciles the two. The only module aware of both.
  auth/    Token lifecycle, with Google Identity Services behind a seam.
  app/     The state React renders from.
```

Everything above `drive/` is written against the `DriveClient` interface rather
than Google's API, which is what lets the sync engine, the views and the screens
all be tested with no network and no credentials.

`model/`, `drive/`, `store/` and `sync/` are UI-independent TypeScript. If a
native iOS app is ever built, only the screens are web-specific.

## Known limitation

The web cannot raise screen brightness, which matters when a gate scanner reads
a dim barcode. The viewer holds a wake lock so the screen will not sleep, but
brightness stays the traveller's own control. This is the most concrete argument
for an eventual native app.

## Design spec

[`docs/superpowers/specs/2026-09-12-trip-itinerary-design.md`](docs/superpowers/specs/2026-09-12-trip-itinerary-design.md)
carries the full reasoning, including the open question about how `drive.file`
grants behave for folders shared with collaborators.
