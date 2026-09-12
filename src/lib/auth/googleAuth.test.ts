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

/** A private store per instance, so no test inherits another's token. */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

function newAuth(source: TokenSource, now: () => number = () => Date.now()) {
  return new GoogleAuth(source, now, memoryStorage());
}

describe('GoogleAuth', () => {
  test('requests a token on first use', async () => {
    const source = sourceReturning(anHour);
    const auth = newAuth(source);

    expect(await auth.getAccessToken()).toBe('token-1');
  });

  test('reuses a token that is still valid rather than asking again', async () => {
    const source = sourceReturning(anHour);
    const auth = newAuth(source);

    await auth.getAccessToken();
    await auth.getAccessToken();

    expect(source.request).toHaveBeenCalledTimes(1);
  });

  test('requests a fresh token once the current one has expired', async () => {
    let now = 0;
    const source = sourceReturning(anHour, { accessToken: 'token-2', expiresInSeconds: 3600 });
    const auth = newAuth(source, () => now);

    await auth.getAccessToken();
    now = 3_600_000 + 1;

    expect(await auth.getAccessToken()).toBe('token-2');
  });

  test('renews slightly before expiry rather than exactly at it', async () => {
    let now = 0;
    const source = sourceReturning(anHour, { accessToken: 'token-2', expiresInSeconds: 3600 });
    const auth = newAuth(source, () => now);
    await auth.getAccessToken();

    // A token that expires mid-flight fails the request that carried it, so it
    // is retired while there is still time to replace it.
    now = 3_600_000 - 30_000;

    expect(await auth.getAccessToken()).toBe('token-2');
  });

  test('asks silently first so a signed-in user is never interrupted', async () => {
    const source = sourceReturning(anHour);
    const auth = newAuth(source);

    await auth.getAccessToken();

    expect(source.request).toHaveBeenCalledWith({ silent: true });
  });

  test('propagates a failure when even the interactive prompt is refused', async () => {
    const request = vi.fn().mockRejectedValue(new Error('user closed the dialog'));
    const auth = newAuth({ request });

    await expect(auth.signIn()).rejects.toThrow(/user closed the dialog/);
  });

  test('shares one in-flight request between concurrent callers', async () => {
    const source = sourceReturning(anHour);
    const auth = newAuth(source);

    await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);

    // Three parallel Drive calls on a cold start must not open three consent
    // flows.
    expect(source.request).toHaveBeenCalledTimes(1);
  });

  test('forgets the token on sign out', async () => {
    const source = sourceReturning(anHour, { accessToken: 'token-2', expiresInSeconds: 3600 });
    const auth = newAuth(source);
    await auth.getAccessToken();

    auth.signOut();

    expect(await auth.getAccessToken()).toBe('token-2');
  });

  test('reports whether a usable token is currently held', async () => {
    const auth = newAuth(sourceReturning(anHour));

    expect(auth.hasValidToken()).toBe(false);
    await auth.getAccessToken();
    expect(auth.hasValidToken()).toBe(true);
  });
});

describe('switching accounts', () => {
  test('drops the current token so the next call re-authorises', async () => {
    const source = sourceReturning(anHour, { accessToken: 'token-2', expiresInSeconds: 3600 });
    const auth = newAuth(source);
    await auth.getAccessToken();

    auth.switchAccount();

    expect(auth.hasValidToken()).toBe(false);
    expect(await auth.getAccessToken()).toBe('token-2');
  });

  test('shows the account chooser instead of silently reusing the session', async () => {
    const request = vi.fn().mockResolvedValue(anHour);
    const auth = newAuth({ request });
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
    const auth = newAuth({ request }, () => now);

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
    const auth = newAuth({ request: sourceReturning(anHour).request, revoke });
    await auth.getAccessToken();

    await auth.signOut();

    // Forgetting the token locally would leave the app still authorised: the
    // next sign-in would sail through silently and nothing would really have
    // been signed out of.
    expect(revoke).toHaveBeenCalledWith('token-1');
  });

  test('forgets the token even if revoking fails', async () => {
    const auth = newAuth({
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
    const auth = newAuth({ request: sourceReturning(anHour).request, revoke });

    await auth.signOut();

    expect(revoke).not.toHaveBeenCalled();
  });

  test('works with a token source that cannot revoke', async () => {
    const auth = newAuth(sourceReturning(anHour));
    await auth.getAccessToken();

    await expect(auth.signOut()).resolves.toBeUndefined();
    expect(auth.hasValidToken()).toBe(false);
  });
});


describe('never prompting without a gesture', () => {
  test('getAccessToken does not fall back to an interactive prompt', async () => {
    const request = vi.fn().mockRejectedValue(new Error('no active session'));
    const auth = newAuth({ request });

    await expect(auth.getAccessToken()).rejects.toThrow();

    // Google's token client opens a popup whatever prompt is asked for, so a
    // background Drive call must never reach one. Nothing on page load has a
    // click behind it, and browsers block popups that do not.
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ silent: true });
  });

  test('signIn is the one path allowed to prompt', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('no active session'))
      .mockResolvedValueOnce(anHour);
    const auth = newAuth({ request });

    expect(await auth.signIn()).toBe('token-1');
    expect(request).toHaveBeenLastCalledWith({ silent: false });
  });

  test('signIn reuses a token already held rather than prompting again', async () => {
    const source = sourceReturning(anHour);
    const auth = newAuth(source);
    await auth.signIn();

    await auth.signIn();

    expect(source.request).toHaveBeenCalledTimes(1);
  });
});

describe('surviving a page reload', () => {
  test('a token outlives the object that fetched it', async () => {
    const storage = memoryStorage();
    const first = new GoogleAuth(sourceReturning(anHour), () => 0, storage);
    await first.signIn();

    // A reload builds everything again from scratch. Without this, every
    // refresh would need a fresh sign-in — which is what made the popup appear.
    const afterReload = new GoogleAuth(sourceReturning(anHour), () => 0, storage);

    expect(afterReload.hasValidToken()).toBe(true);
    expect(await afterReload.getAccessToken()).toBe('token-1');
  });

  test('an expired stored token is not trusted', async () => {
    const storage = memoryStorage();
    const first = new GoogleAuth(sourceReturning(anHour), () => 0, storage);
    await first.signIn();

    const later = new GoogleAuth(sourceReturning(anHour), () => 3_600_001, storage);

    expect(later.hasValidToken()).toBe(false);
  });

  test('signing out clears the stored token too', async () => {
    const storage = memoryStorage();
    const auth = new GoogleAuth(sourceReturning(anHour), () => 0, storage);
    await auth.signIn();

    await auth.signOut();

    expect(new GoogleAuth(sourceReturning(anHour), () => 0, storage).hasValidToken()).toBe(
      false,
    );
  });

  test('ignores stored junk rather than failing to start', async () => {
    const storage = memoryStorage();
    storage.setItem('marching-orders:token', 'not json');

    expect(new GoogleAuth(sourceReturning(anHour), () => 0, storage).hasValidToken()).toBe(
      false,
    );
  });
});

describe('staying signed in', () => {
  test('a token is reused for its whole life, not re-fetched per page', async () => {
    const storage = memoryStorage();
    let now = 0;
    const source = sourceReturning(anHour, {
      accessToken: 'token-2',
      expiresInSeconds: 3600,
    });

    await new GoogleAuth(source, () => now, storage).signIn();

    // Four reloads over the following half hour.
    for (const minute of [5, 12, 20, 30]) {
      now = minute * 60_000;
      const reloaded = new GoogleAuth(source, () => now, storage);
      expect(await reloaded.getAccessToken()).toBe('token-1');
    }

    // Google was asked exactly once, so no window ever opened after the first.
    expect(source.request).toHaveBeenCalledTimes(1);
  });

  test('reports itself signed out once the hour is up, rather than failing later', async () => {
    const storage = memoryStorage();
    await new GoogleAuth(sourceReturning(anHour), () => 0, storage).signIn();

    const expired = new GoogleAuth(sourceReturning(anHour), () => 3_600_001, storage);

    // The UI uses this to decide whether to offer signing in, so it has to be
    // answerable without a network call.
    expect(expired.hasValidToken()).toBe(false);
  });
});
