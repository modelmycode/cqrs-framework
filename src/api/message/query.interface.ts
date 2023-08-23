/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Query<TResponse = any> extends Object {
  /** Define the expected response type. Do not assign value. */
  $responseType: TResponse
}

export type QueryResponse<T extends Query> = T['$responseType']

export type QueryReturnType<T extends Query> = Promise<QueryResponse<T>>
