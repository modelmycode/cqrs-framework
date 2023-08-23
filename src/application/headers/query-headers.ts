import { QueryRequest } from 'axon-server-node-api'

import { AuthToken } from '../access-guards/auth-token'
import { deserializeObject } from '../axon-serialization'

/** Only headers listed here will be passed with query via message bus. */
const defaults = {
  authorization: '',
  ipAddress: '',
  token: null as AuthToken | null,
}

export type QueryHeaders = Partial<typeof defaults>

/** Encode query headers into query payload. */
export function encodeQueryHeaders(headers: Record<string, string>): {
  __headers: QueryHeaders
} {
  const __headers = Object.keys(defaults).reduce((r, k) => {
    if (k in headers && k !== 'token') {
      Object.assign(r, { [k]: headers[k] })
    }
    return r
  }, {})
  return { __headers }
}

/** Decode query headers out of query payload. */
export function decodeQueryWithHeaders(query: QueryRequest): {
  payload: any
  headers: QueryHeaders
} {
  const { __headers, ...payload } = deserializeObject(query.getPayload()!)
  return { payload, headers: __headers }
}
