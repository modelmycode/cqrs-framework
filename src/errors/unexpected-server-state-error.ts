import { serverStateError } from '..'
import { TOptions } from 'i18next'

import { BackendError } from './backend-error'

export class UnexpectedServerStateError<T = unknown> extends BackendError<T> {
  /**
   * @param message Error message for dev/debug/logging
   * @param i18n Message translation options for end users
   * @param data Extra data for clients
   */
  constructor(message?: string, i18n?: boolean | TOptions, data?: T) {
    super(serverStateError, message, i18n, data)
  }
}
