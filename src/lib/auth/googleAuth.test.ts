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

describe('switching accounts', () => {
  test('drops the current token so the next call re-authorises', async () => {
    const source = sourceReturning(anHour, { accessToken: 'token-2', expiresInSeconds: 3600 });
    const auth = new GoogleAuth(source);
    await auth.getAccessToken();

    auth.switchAccount();

    expect(auth.hasValidToken()).toBe(false);
    expect(await auth.getAccessToken()).toBe('token-2');
  });

  test('shows the account chooser instead of silently reusing the session', async () => {
    const request = vi.fn().mockResolvedValue(anHour);
    const auth = new GoogleAuth({ request });
    await auth.getAccessToken();

    auth.switchAccount();
    await auth.getAccessToken();

    // A silent request would hand back the same account the user is trying to
    // move away from, making the button look broken.
    expect(request).toHaveBeenLastCalledWith({ silent: false, chooseAccount: true });
  });

  test('goes back to silent renewal once an account has been chosen', async () => {
    let now = 0;
    const request = vi.fn().mockResolvedValue(anHour);
    const auth = new GoogleAuth({ request }, () => now);

    auth.switchAccount();
    await auth.getAccessToken();
    now = 3_600_000 + 1;
    await auth.getAccessToken();

    expect(request).toHaveBeenLastCalledWith({ silent: true });
  });
});

describe('signing out', () => {
  test('withdraws the app’s access rather than only forgetting it', async () => {
    const revoke = vi.fn().mockResolvedValue(undefined);
    const auth = new GoogleAuth({ request: sourceReturning(anHour).request, revoke });
    await auth.getAccessToken();

    await auth.signOut();

    // Forgetting the token locally would leave the app still authorised: the
    // next sign-in would sail through silently and nothing would really have
    // been signed out of.
    expect(revoke).toHaveBeenCalledWith('token-1');
  });

  test('forgets the token even if revoking fails', async () => {
    const auth = new GoogleAuth({
      request: sourceReturning(anHour, { accessToken: 'token-2', expiresInSeconds: 3600 })
        .request,
      revoke: vi.fn().mockRejectedValue(new Error('offline')),
    });
    await auth.getAccessToken();

    await auth.signOut();

    // Signing out while offline must still sign you out locally.
    expect(auth.hasValidToken()).toBe(false);
  });

  test('does nothing to revoke when no token is held', async () => {
    const revoke = vi.fn();
    const auth = new GoogleAuth({ request: sourceReturning(anHour).request, revoke });

    await auth.signOut();

    expect(revoke).not.toHaveBeenCalled();
  });

  test('works with a token source that cannot revoke', async () => {
    const auth = new GoogleAuth(sourceReturning(anHour));
    await auth.getAccessToken();

    await expect(auth.signOut()).resolves.toBeUndefined();
    expect(auth.hasValidToken()).toBe(false);
  });
});

describe('priming a session on load', () => {
  test('reports success when an existing Google session can be reused', async () => {
    const auth = new GoogleAuth(sourceReturning(anHour));

    expect(await auth.primeSilently()).toBe(true);
    expect(auth.hasValidToken()).toBe(true);
  });

  test('reports failure instead of prompting when there is no session', async () => {
    const request = vi.fn().mockRejectedValue(new Error('no active session'));
    const auth = new GoogleAuth({ request });

    expect(await auth.primeSilently()).toBe(false);
  });

  test('never falls back to an interactive prompt', async () => {
    const request = vi.fn().mockRejectedValue(new Error('no active session'));
    const auth = new GoogleAuth({ request });

    await auth.primeSilently();

    // This runs on page load, with no click behind it. A popup here would be
    // both unasked for and blocked by the browser.
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ silent: true });
  });

  test('reuses a token already in hand without asking again', async () => {
    const source = sourceReturning(anHour);
    const auth = new GoogleAuth(source);
    await auth.getAccessToken();

    expect(await auth.primeSilently()).toBe(true);
    expect(source.request).toHaveBeenCalledTimes(1);
  });
});
