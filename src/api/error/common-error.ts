import { errorCode } from './error-code'

/** 401 Unauthorized */
export const unauthorizedError = errorCode('common', 'unauthorized')

/** 403 Forbidden */
export const forbiddenError = errorCode('common', 'forbidden')

/** 404 Not Found */
export const notFoundError = errorCode('common', 'notFound')

/** 404 Not Found */
export const unExpectedQueryResultError = errorCode(
  'common',
  'unexpectedQueryResult',
)

/** 400 Bad Request (does not confirm to command schema) */
export const commandSchemaError = errorCode('common', 'commandSchema')

/** 422 Unprocessable Entity */
export const invalidClientRequestError = errorCode('common', 'invalidRequest')

/** 500 Server Internal Error */
export const serverStateError = errorCode('common', 'unexpectedState', 'server')

export function toHttpStatus(code: string) {
  if (code === unauthorizedError) return 401
  if (code === forbiddenError) return 403
  if (code === notFoundError) return 404
  if (code === invalidClientRequestError) return 422

  if (/:server\./.test(code)) return 500

  return 400
}
