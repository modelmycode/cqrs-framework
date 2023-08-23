import {Query, RespondingCommand} from '../..'
import {Response} from 'express'

export type CommandReturnHeadersOnly = Promise<{ __headers: any }>

export type CommandReturnWithHeaders<T extends RespondingCommand> = Promise<{
  response: T['$responseType']
  __headers: any
}>

export type QueryReturnWithHeaders<T extends Query> = Promise<{
  response: T['$responseType']
  __headers: any
}>

type ResponseWithHeaders = { response: any; __headers: any }

export function encodeResponseHeaders(
  headers: any,
  response: any = null,
): ResponseWithHeaders {
  return {
    response,
    __headers: {}
  }
}

/**
 * @see CommandReturnWithHeaders
 * @see QueryReturnWithHeaders
 */
export function decodeResponseHeader(result: any, res: Response): any {
  if (!result || !('__headers' in result)) return result

  const {__headers, response} = result as ResponseWithHeaders

  for (const [key, value] of Object.entries(__headers)) {
    res.setHeader(key, value as string)
  }

  return response
}
