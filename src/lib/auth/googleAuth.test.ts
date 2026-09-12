import { describe, expect, test, vi } from 'vitest';
import { GoogleAuth, type TokenSource } from './googleAuth';

function sourceReturning(...grants: { accessToken: string; expiresInSeconds: number }[]) {
  const queue = [...grants];
  const request = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('no grant queued');
    return next;
  });
  return { request } satisfies TokenSource;
}

const anHour = { accessToken: 'token-1', expiresInSeconds: 3600 };

describe('GoogleAuth', () => {
  test('requests a token on first use', async () => {
    const source = sourceReturning(anHour);
    const auth = new GoogleAuth(source);

    expect(await auth.getAccessToken()).toBe('token-1');
  });

  test('reuses a token that is still valid rather than asking again', async () => {
    const source = sourceReturning(anHour);
    const auth = new GoogleAuth(source);

    await auth.getAccessToken();
    await auth.getAccessToken();

    expect(source.request).toHaveBeenCalledTimes(1);
  });

  test('requests a fresh token once the current one has expired', async () => {
    let now = 0;
    const source = sourceReturning(anHour, { accessToken: 'token-2', expiresInSeconds: 3600 });
    const auth = new GoogleAuth(source, () => now);

    await auth.getAccessToken();
    now = 3_600_000 + 1;

    expect(await auth.getAccessToken()).toBe('token-2');
  });

  test('renews slightly before expiry rather than exactly at it', async () => {
    let now = 0;
    const source = sourceReturning(anHour, { accessToken: 'token-2', expiresInSeconds: 3600 });
    const auth = new GoogleAuth(source, () => now);
    await auth.getAccessToken();

    // A token that expires mid-flight fails the request that carried it, so it
    // is retired while there is still time to replace it.
    now = 3_600_000 - 30_000;

    expect(await auth.getAccessToken()).toBe('token-2');
  });

  test('asks silently first so a signed-in user is never interrupted', async () => {
    const source = sourceReturning(anHour);
    const auth = new GoogleAuth(source);

    await auth.getAccessToken();

    expect(source.request).toHaveBeenCalledWith({ silent: true });
  });

  test('falls back to an interactive prompt when the silent request fails', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('no active session'))
      .mockResolvedValueOnce(anHour);
    const auth = new GoogleAuth({ request });

    expect(await auth.getAccessToken()).toBe('token-1');
    expect(request).toHaveBeenLastCalledWith({ silent: false });
  });

  test('propagates a failure when even the interactive prompt is refused', async () => {
    const request = vi.fn().mockRejectedValue(new Error('user closed the dialog'));
    const auth = new GoogleAuth({ request });

    await expect(auth.getAccessToken()).rejects.toThrow(/user closed the dialog/);
  });

  test('shares one in-flight request between concurrent callers', async () => {
    const source = sourceReturning(anHour);
    const auth = new GoogleAuth(source);

    await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);

    // Three parallel Drive calls on a cold start must not open three consent
    // flows.
    expect(source.request).toHaveBeenCalledTimes(1);
  });

  test('forgets the token on sign out', async () => {
    const source = sourceReturning(anHour, { accessToken: 'token-2', expiresInSeconds: 3600 });
    const auth = new GoogleAuth(source);
    await auth.getAccessToken();

    auth.signOut();

    expect(await auth.getAccessToken()).toBe('token-2');
  });

  test('reports whether a usable token is currently held', async () => {
    const auth = new GoogleAuth(sourceReturning(anHour));

    expect(auth.hasValidToken()).toBe(false);
    await auth.getAccessToken();
    expect(auth.hasValidToken()).toBe(true);
  });
});
