/**
 * Drive failures the app reacts to differently.
 *
 * The distinctions matter: an expired token should trigger a silent re-auth, a
 * rate limit should back off and retry, and everything else should surface to
 * the user rather than being retried forever.
 */

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

/** The access token is missing, expired, or rejected. Re-authenticate. */
export class DriveAuthError extends DriveError {
  constructor(message: string, status = 401) {
    super(message, status);
    this.name = 'DriveAuthError';
  }
}

/** Drive is throttling. Back off and retry — this is not a permanent failure. */
export class DriveRateLimitError extends DriveError {
  constructor(message: string, status = 403) {
    super(message, status);
    this.name = 'DriveRateLimitError';
  }
}
