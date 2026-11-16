/**
 * Error codes the auth hooks of this app add to the auth library's own (set in `auth.ts`, read by
 * the forms).
 */

/** A sign-in refused because the account is deactivated. */
export const ACCOUNT_DEACTIVATED = "ACCOUNT_DEACTIVATED";
/** A password change refused because the new password equals the current one. */
export const PASSWORD_UNCHANGED = "PASSWORD_UNCHANGED";
