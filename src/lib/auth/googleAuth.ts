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
  request(options: { silent: boolean }): Promise<TokenGrant>;
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

  constructor(
    private readonly source: TokenSource,
    private readonly now: () => number = () => Date.now(),
  ) {}

  hasValidToken(): boolean {
    return this.#token !== null && this.now() < this.#token.expiresAt - RENEW_MARGIN_MS;
  }

  signOut(): void {
    this.#token = null;
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
    try {
      // Silent first: a signed-in user should never see a dialog just because
      // an hour elapsed while the app sat in the background.
      grant = await this.source.request({ silent: true });
    } catch {
      grant = await this.source.request({ silent: false });
    }

    this.#token = {
      value: grant.accessToken,
      expiresAt: this.now() + grant.expiresInSeconds * 1000,
    };
    return grant.accessToken;
  }
}
