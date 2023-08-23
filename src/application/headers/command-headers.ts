import { Command } from 'axon-server-node-api'

import { AuthToken } from '../access-guards/auth-token'
import { deserializeObject } from '../axon-serialization'

/** Only headers listed here will be passed with command via message bus. */
const defaults = {
  authorization: '',
  ipAddress: '',
  token: null as AuthToken | null,
}

export type CommandHeaders = Partial<typeof defaults>

/** Encode command headers into command payload. */
export function encodeCommandHeaders(headers: Record<string, string>): {
  __headers: CommandHeaders
} {
  const __headers = Object.keys(defaults).reduce((r, k) => {
    if (k in headers && k !== 'token') {
      Object.assign(r, { [k]: headers[k] })
    }
    return r
  }, {})
  return { __headers }
}

/** Decode command headers out of command payload. */
export function decodeCommandWithHeaders(command: Command): {
  payload: any
  headers: CommandHeaders
} {
  const { __headers, ...payload } = deserializeObject(command.getPayload()!)
  return { payload, headers: __headers }
}
