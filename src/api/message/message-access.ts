/**
 * @example { auth: true } - Require valid auth token
 * @example { auth: 'support' } - Require valid auth token with support access
 * @example { rbac: { level: 'all' } } - Require access to organisation
 */
export type MessageAccess = {
  /** Require auth token, or support user access */
  auth?: boolean | 'support'

  /**
   * Require rbac to organisation.
   * Requires `organisationId` (or other `key`).
   * Do not need `auth: true` as valid `auth` token is required by rbac.
   */
  rbac?: {
    /** The key to get organisationId from message payload */
    key?: string

    /** Allowed levels */
    level: 'all' | number | number[]

  }
}

/** Message access guard map by message name */
export const messageAccess = new Map<string, MessageAccess>()
