import { CommandHeaders } from '../headers/command-headers'
import { QueryHeaders } from '../headers/query-headers'
import { AuthToken } from './auth-token'

export async function validateAuthToken<
  T extends CommandHeaders | QueryHeaders,
>(
  headers: T,
  messageName: string,
  messageBody: any,
  checkJwtHeader?: boolean,
): Promise<T> {
  const token = parseAuthToken(headers, checkJwtHeader)
  const result: T = { ...headers, token }
  return result
}

function parseAuthToken<T extends CommandHeaders | QueryHeaders>(
  headers: T,
  checkJwtHeader?: boolean,
): AuthToken | null {
  return null
}
