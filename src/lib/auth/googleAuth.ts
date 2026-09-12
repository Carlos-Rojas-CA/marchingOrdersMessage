/**
 * Access-token lifecycle for Drive calls.
 *
 * The browser never holds a refresh token — Google Identity Services hands out
 * short-lived access tokens and re-issues them while the user has a live
 * Google session. Offline use needs no token at all, because everything the UI
 * renders comes from local storage.
 *
 * The governing rule here is that **nothing prompts without a click**. Google's
 * token client opens a popup window whatever `prompt` it is given — the prompt
 * only decides whether Google closes it again immediately. So a background
 * Drive call must never be able to reach one, or merely reloading the page
 * throws up a consent window, which browsers then block for having seen no
 * gesture. `getAccessToken` is therefore silent-only, and `signIn` is the
 * single path allowed to interrupt.
 */

export interface TokenGrant {
  accessToken: string;
  expiresInSeconds: number;
}

/**
 * Where tokens come from. The GIS adapter implements this; tests substitute a
 * fake so none of the logic below needs a network or a Google account.
 */
export interface TokenSource {
  request(options: { silent: boolean; chooseAccount?: boolean }): Promise<TokenGrant>;
  /**
   * Withdraws the app's access with Google. Optional: a source that cannot
   * revoke simply leaves the grant standing.
   */
  revoke?(accessToken: string): Promise<void>;
}

/** The slice of Storage this needs, so tests can pass a plain map. */
export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Retire a token this long before it actually expires.
 *
 * A token that lapses mid-flight fails the request carrying it, which surfaces
 * as a spurious error at the worst possible time. Renewing early costs nothing.
 */
const RENEW_MARGIN_MS = 60_000;

const STORAGE_KEY = 'marching-orders:token';

interface HeldToken {
  value: string;
  expiresAt: number;
}

function defaultStorage(): TokenStorage | null {
  try {
    // Session storage: a token survives a reload — which is the whole point —
    // without lingering after the tab is closed.
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export class GoogleAuth {
  #token: HeldToken | null = null;
  #inFlight: Promise<string> | null = null;
  /** Set by `switchAccount`, cleared as soon as a chooser has been shown. */
  #chooseAccount = false;

  constructor(
    private readonly source: TokenSource,
    private readonly now: () => number = () => Date.now(),
    private readonly storage: TokenStorage | null = defaultStorage(),
  ) {
    this.#token = this.#restore();
  }

  #restore(): HeldToken | null {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) return null;
      const held = JSON.parse(raw) as HeldToken;
      if (typeof held?.value !== 'string' || typeof held?.expiresAt !== 'number') {
        return null;
      }
      return held;
    } catch {
      // Stored junk must not stop the app starting.
      return null;
    }
  }

  #hold(grant: TokenGrant): string {
    this.#token = {
      value: grant.accessToken,
      expiresAt: this.now() + grant.expiresInSeconds * 1000,
    };
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.#token));
    } catch {
      // A full or unavailable store only costs a prompt on the next reload.
    }
    return grant.accessToken;
  }

  #forget(): void {
    this.#token = null;
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // Nothing useful to do; the in-memory token is already gone.
    }
  }

  hasValidToken(): boolean {
    return this.#token !== null && this.now() < this.#token.expiresAt - RENEW_MARGIN_MS;
  }

  /**
   * Signs out, withdrawing the app's access rather than merely forgetting it.
   *
   * Dropping the token locally would leave the grant standing with Google, so
   * the next sign-in would sail through silently and nothing would really have
   * been signed out of.
   *
   * Revocation is best-effort: signing out while offline must still sign you
   * out locally, so a failure here is not allowed to keep the token alive.
   */
  async signOut(): Promise<void> {
    const token = this.#token?.value;
    this.#forget();
    if (!token || !this.source.revoke) return;
    try {
      await this.source.revoke(token);
    } catch {
      // The local token is already gone, which is the part that matters here.
    }
  }

  /**
   * Drops the token and forces Google's account chooser on the next sign-in.
   *
   * Without the chooser, a silent request would hand back the very account the
   * user is trying to move away from, and the button would look broken.
   */
  switchAccount(): void {
    this.#forget();
    this.#chooseAccount = true;
  }

  /**
   * A token for a background call. Never opens anything.
   *
   * Throws when no usable token is held and the session cannot be reused
   * silently. Callers on the automatic path should let that fail quietly and
   * carry on showing local data.
   */
  async getAccessToken(): Promise<string> {
    if (this.#token && this.hasValidToken()) return this.#token.value;

    // A cold start fires several Drive calls at once; without this each would
    // open its own request.
    this.#inFlight ??= this.#acquire(false).finally(() => {
      this.#inFlight = null;
    });

    return await this.#inFlight;
  }

  /**
   * A token for something the user just asked for.
   *
   * The only path that may show Google's consent window, because it is the
   * only one with a click behind it.
   */
  async signIn(): Promise<string> {
    if (this.#token && this.hasValidToken()) return this.#token.value;
    return await this.#acquire(true);
  }

  async #acquire(interactive: boolean): Promise<string> {
    if (this.#chooseAccount) {
      try {
        return this.#hold(
          await this.source.request({ silent: false, chooseAccount: true }),
        );
      } finally {
        // One chooser, then back to silent renewal — otherwise every hourly
        // refresh would interrupt with a picker.
        this.#chooseAccount = false;
      }
    }

    try {
      // Silent first either way: a signed-in user should never see a dialog
      // just because an hour elapsed while the app sat in the background.
      return this.#hold(await this.source.request({ silent: true }));
    } catch (cause) {
      if (!interactive) throw cause;
      return this.#hold(await this.source.request({ silent: false }));
    }
  }
}
