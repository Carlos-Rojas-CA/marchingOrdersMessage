import { describe, expect, test } from 'vitest';
import { isShortenedMapsUrl, mapsLinkFor, parseMapsUrl } from './maps';

describe('parseMapsUrl', () => {
  test('reads the place name and coordinates from a shared Google link', () => {
    const found = parseMapsUrl(
      'https://www.google.com/maps/place/Trattoria+Da+Nennella/@40.8345,14.2481,17z/data=!3m1!4b1',
    );

    expect(found).toMatchObject({
      name: 'Trattoria Da Nennella',
      lat: 40.8345,
      lng: 14.2481,
    });
  });

  test('prefers the pin coordinates over the map centre when both are there', () => {
    // The @ pair is wherever the viewport happened to be; !3d/!4d is the place
    // itself, which is what someone sharing a link actually means.
    const found = parseMapsUrl(
      'https://www.google.com/maps/place/Somewhere/@40.8000,14.2000,17z/data=!3m1!4b1!4m5!3m4!1s0x0!8m2!3d40.8345!4d14.2481',
    );

    expect(found).toMatchObject({ lat: 40.8345, lng: 14.2481 });
  });

  test('decodes a name written with escapes', () => {
    const found = parseMapsUrl(
      'https://www.google.com/maps/place/Caff%C3%A8+Gambrinus/@40.8358,14.2487,17z',
    );

    expect(found?.name).toBe('Caffè Gambrinus');
  });

  test('reads a plain query link', () => {
    expect(parseMapsUrl('https://maps.google.com/?q=40.8345,14.2481')).toMatchObject({
      lat: 40.8345,
      lng: 14.2481,
    });
  });

  test('reads a search link written as text', () => {
    expect(
      parseMapsUrl('https://www.google.com/maps/search/?api=1&query=Castel+dell%27Ovo'),
    ).toMatchObject({ name: "Castel dell'Ovo" });
  });

  test('reads an Apple Maps link', () => {
    expect(
      parseMapsUrl('https://maps.apple.com/?q=Castel%20dell%27Ovo&ll=40.8280,14.2478'),
    ).toMatchObject({ name: "Castel dell'Ovo", lat: 40.828, lng: 14.2478 });
  });

  test('gets nothing useful from a shortened link, and says so', () => {
    // maps.app.goo.gl hides everything behind a redirect the browser is not
    // allowed to follow. The link still works when tapped — it just cannot be
    // read here.
    expect(parseMapsUrl('https://maps.app.goo.gl/abc123')).toBeNull();
  });

  test('ignores something that is not a map link at all', () => {
    expect(parseMapsUrl('https://example.com/hello')).toBeNull();
    expect(parseMapsUrl('not a url')).toBeNull();
  });

  test('rejects coordinates that are not on Earth', () => {
    expect(parseMapsUrl('https://maps.google.com/?q=999,999')).toBeNull();
  });
});

describe('mapsLinkFor', () => {
  const place = { name: 'Paint class', address: 'Via Toledo 1, Napoli' };

  test('uses a link the traveller pasted, whatever it points at', () => {
    const link = mapsLinkFor({ ...place, mapsUrl: 'https://maps.app.goo.gl/abc' }, 'ios');

    // Their own link opens their own app, which beats any guess this could
    // make about which maps they prefer.
    expect(link).toBe('https://maps.app.goo.gl/abc');
  });

  test('sends an Apple device to Apple Maps', () => {
    expect(mapsLinkFor(place, 'ios')).toContain('maps.apple.com');
  });

  test('sends everything else to Google Maps', () => {
    expect(mapsLinkFor(place, 'other')).toContain('google.com/maps');
  });

  test('prefers exact coordinates to an address that has to be searched', () => {
    const link = mapsLinkFor({ ...place, lat: 40.8345, lng: 14.2481 }, 'other');

    // Percent-encoded in the URL, which is correct; what matters is that the
    // coordinates went in rather than the address.
    expect(decodeURIComponent(link!)).toContain('40.8345,14.2481');
    expect(link).not.toContain('Toledo');
  });

  test('falls back to the address when there are no coordinates', () => {
    expect(mapsLinkFor(place, 'other')).toContain(encodeURIComponent(place.address));
  });

  test('falls back to the name when there is not even an address', () => {
    expect(mapsLinkFor({ name: 'Colosseum' }, 'other')).toContain('Colosseum');
  });

  test('has nothing to offer for a place with nothing in it', () => {
    expect(mapsLinkFor({ name: '' }, 'other')).toBeNull();
  });
});

describe('isShortenedMapsUrl', () => {
  test('recognises the link a phone share sheet produces', () => {
    expect(isShortenedMapsUrl('https://maps.app.goo.gl/abc123')).toBe(true);
    expect(isShortenedMapsUrl('https://goo.gl/maps/abc123')).toBe(true);
  });

  test('does not mistake a full link for a shortened one', () => {
    expect(
      isShortenedMapsUrl('https://www.google.com/maps/place/Somewhere/@40.8,14.2,17z'),
    ).toBe(false);
  });

  test('says no to things that are not links', () => {
    expect(isShortenedMapsUrl('Via Toledo 1')).toBe(false);
    expect(isShortenedMapsUrl('')).toBe(false);
  });
});
