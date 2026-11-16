/** What the pages and routes read from the account of a session, beyond its id and role. */

/**
 * Deactivating an account deletes its sessions; this is the second barrier, for a session that
 * was being created at that very moment.
 */
export const isDeactivated = (session: { user: object }) =>
  Boolean((session.user as { deactivatedAt?: unknown }).deactivatedAt);

/** True when an administrator reset the password and the person has not chosen a new one yet. */
export const mustChangePassword = (session: { user: object }) =>
  (session.user as { mustChangePassword?: unknown }).mustChangePassword === true;
