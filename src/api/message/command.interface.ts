/* eslint-disable @typescript-eslint/no-explicit-any */

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Command extends Object {}

/**
 * A command that expects a response.
 * Use `Command` without a response instead in most cases (CQRS principle).
 */
export interface RespondingCommand<TResponse = any> extends Object {
  /** Define the expected response type. Do not assign value. */
  $responseType: TResponse
}

export type CommandResponse<T extends RespondingCommand> = T['$responseType']

export type CommandReturnType<T extends RespondingCommand> = Promise<
  CommandResponse<T>
>
