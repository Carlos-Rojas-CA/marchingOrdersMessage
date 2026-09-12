/**
 * Access-token lifecycle for Drive calls.
 *
 * The browser never holds a refresh token — Google Identity Services hands out
 * short-lived access tokens and re-issues them silently while the user has a
 * live Google session. Offline use needs no token at all, because everything
 * the UI renders comes from local storage.
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

/**
 * Retire a token this long before it actually expires.
 *
 * A token that lapses mid-flight fails the request carrying it, which surfaces
 * as a spurious error at the worst possible time. Renewing early costs nothing.
 */
const RENEW_MARGIN_MS = 60_000;

export class GoogleAuth {
  #token: { value: string; expiresAt: number } | null = null;
  #inFlight: Promise<string> | null = null;
  /** Set by `switchAccount`, cleared as soon as a chooser has been shown. */
  #chooseAccount = false;

  constructor(
    private readonly source: TokenSource,
    private readonly now: () => number = () => Date.now(),
  ) {}

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
    this.#token = null;
    if (!token || !this.source.revoke) return;
    try {
      await this.source.revoke(token);
    } catch {
      // The local token is already gone, which is the part that matters here.
    }
  }

  /**
   * Drops the token and forces Google's account chooser on the next call.
   *
   * Without the chooser, a silent request would hand back the very account the
   * user is trying to move away from, and the button would look broken.
   */
  switchAccount(): void {
    this.#token = null;
    this.#chooseAccount = true;
  }

  /**
   * Tries to reuse an existing Google session without showing anything.
   *
   * Runs on page load, where there is no click to justify a popup — and where
   * a browser would block one anyway. Returns whether a token is now held, so
   * the caller can decide what to do rather than being surprised by a dialog.
   */
  async primeSilently(): Promise<boolean> {
    if (this.hasValidToken()) return true;
    try {
      const grant = await this.source.request({ silent: true });
      this.#token = {
        value: grant.accessToken,
        expiresAt: this.now() + grant.expiresInSeconds * 1000,
      };
      return true;
    } catch {
      return false;
    }
  }

  async getAccessToken(): Promise<string> {
    if (this.#token && this.hasValidToken()) return this.#token.value;

    // A cold start fires several Drive calls at once. Without this, each would
    // open its own consent flow.
    this.#inFlight ??= this.#acquire().finally(() => {
      this.#inFlight = null;
    });

    return await this.#inFlight;
  }

  async #acquire(): Promise<string> {
    let grant: TokenGrant;
    if (this.#chooseAccount) {
      try {
        grant = await this.source.request({ silent: false, chooseAccount: true });
      } finally {
        // One chooser, then back to silent renewal — otherwise every hourly
        // refresh would interrupt with a picker.
        this.#chooseAccount = false;
      }
    } else {
      try {
        // Silent first: a signed-in user should never see a dialog just because
        // an hour elapsed while the app sat in the background.
        grant = await this.source.request({ silent: true });
      } catch {
        grant = await this.source.request({ silent: false });
      }
    }

    this.#token = {
      value: grant.accessToken,
      expiresAt: this.now() + grant.expiresInSeconds * 1000,
    };
    return grant.accessToken;
  }
}
