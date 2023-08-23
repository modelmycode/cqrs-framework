import { TOptions } from 'i18next'

export class BackendError<TData = unknown> extends Error {
  readonly name = 'BackendError'

  /**
   * @param code Format `{namespace}Error:[client|server].{name}`
   * @param message Error message for dev/debug/logging
   * @param i18n Message translation options for end users
   * @param data Extra data for clients
   */
  constructor(
    public readonly code: string,
    message?: string,
    public readonly i18n?: boolean | TOptions,
    public readonly data?: TData,
  ) {
    super(message)
  }
}
