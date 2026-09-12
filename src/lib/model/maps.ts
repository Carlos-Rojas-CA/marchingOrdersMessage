/**
 * Reading map links, and building ones that open the right app.
 *
 * Two separate jobs. Reading a pasted link is a convenience — it can fill in a
 * name and coordinates so they do not have to be typed. Building one is not:
 * it is how someone standing on a street corner gets walking directions, and
 * it has to land in the maps app they actually use.
 */

export interface MapPlace {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  /** A link the traveller pasted. Trusted over anything derived. */
  mapsUrl?: string;
}

export interface ParsedPlace {
  name?: string;
  lat?: number;
  lng?: number;
}

function onEarth(lat: number, lng: number): boolean {
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' ')).trim();
  } catch {
    return value.replace(/\+/g, ' ').trim();
  }
}

/**
 * Pulls what it can out of a shared map link.
 *
 * Returns `null` when there is nothing to read — including for the shortened
 * `maps.app.goo.gl` links a phone's share sheet produces, which hide
 * everything behind a redirect the browser is not permitted to follow. Those
 * links still work perfectly when tapped; they just cannot be inspected here,
 * so they are kept as-is rather than guessed at.
 */
export function parseMapsUrl(input: string): ParsedPlace | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const isMaps =
    host.endsWith('google.com') ||
    host.endsWith('google.co.uk') ||
    host.endsWith('goo.gl') ||
    host.endsWith('maps.apple.com') ||
    host.endsWith('apple.com');
  if (!isMaps) return null;

  const found: ParsedPlace = {};
  const path = decodeURIComponent(url.pathname);

  // `/place/<name>/…` — the label Google shows for the pin.
  const named = /\/place\/([^/@]+)/.exec(url.pathname);
  if (named?.[1] && !/^-?\d+\.\d+,/.test(decode(named[1]))) {
    found.name = decode(named[1]);
  }

  // `!3d<lat>!4d<lng>` is the place itself; `@lat,lng` is only wherever the
  // viewport happened to sit, so the former wins when both are present.
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url.href);
  const centre = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url.href);
  const coords = pin ?? centre;
  if (coords) {
    const lat = Number(coords[1]);
    const lng = Number(coords[2]);
    if (onEarth(lat, lng)) {
      found.lat = lat;
      found.lng = lng;
    }
  }

  // Query forms: `?q=`, `?query=`, and Apple's `?ll=`.
  const ll = url.searchParams.get('ll');
  if (ll && found.lat === undefined) {
    const [lat, lng] = ll.split(',').map(Number);
    if (lat !== undefined && lng !== undefined && onEarth(lat, lng)) {
      found.lat = lat;
      found.lng = lng;
    }
  }

  const query = url.searchParams.get('q') ?? url.searchParams.get('query');
  if (query) {
    const asCoords = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(query.trim());
    if (asCoords) {
      const lat = Number(asCoords[1]);
      const lng = Number(asCoords[2]);
      if (onEarth(lat, lng) && found.lat === undefined) {
        found.lat = lat;
        found.lng = lng;
      }
    } else if (!found.name) {
      found.name = decode(query);
    }
  }

  // A coordinate pair written straight into the path, e.g. /place/40.8,14.2
  if (found.lat === undefined) {
    const inPath = /\/(-?\d+\.\d+),(-?\d+\.\d+)/.exec(path);
    if (inPath) {
      const lat = Number(inPath[1]);
      const lng = Number(inPath[2]);
      if (onEarth(lat, lng)) {
        found.lat = lat;
        found.lng = lng;
      }
    }
  }

  return found.name || found.lat !== undefined ? found : null;
}

/**
 * Whether this is one of the shortened links a phone's share sheet produces.
 *
 * Worth telling apart because nothing can be read from one, and the reason is
 * worth explaining rather than looking like a failure: the target sits behind
 * a redirect served with no `Access-Control-Allow-Origin` header and
 * `X-Frame-Options: SAMEORIGIN`, so neither fetch nor an iframe may follow it.
 * Only a server can, and standing one up to recover a name that can be typed
 * in five seconds is a poor trade.
 */
export function isShortenedMapsUrl(input: string): boolean {
  try {
    const host = new URL(input.trim()).hostname.toLowerCase();
    return host.endsWith('goo.gl');
  } catch {
    return false;
  }
}

export type Platform = 'ios' | 'other';

/** Whether this device's default maps app is Apple's. */
export function devicePlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  const appleTouch = /iPhone|iPad|iPod/i.test(ua);
  // Modern iPads report as Macs, so touch support separates them from desktops.
  const iPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return appleTouch || iPadOS ? 'ios' : 'other';
}

/**
 * A link that opens this place in the maps app the device actually uses.
 *
 * There is no single URL that means "whatever maps app you prefer", so the
 * order is: a link the traveller pasted first — theirs will open their app —
 * then the platform's own maps, which is the closest thing to a default.
 */
export function mapsLinkFor(place: MapPlace, platform: Platform): string | null {
  if (place.mapsUrl) return place.mapsUrl;

  // Coordinates beat text: an address still has to be searched for, and
  // searches go wrong on exactly the streets that are hardest to find.
  const target =
    place.lat !== undefined && place.lng !== undefined
      ? `${place.lat},${place.lng}`
      : place.address || place.name;

  if (!target) return null;

  const query = encodeURIComponent(target);
  return platform === 'ios'
    ? `https://maps.apple.com/?q=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
}
