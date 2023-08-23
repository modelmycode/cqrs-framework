import { invalidClientRequestError } from '..'
import { TOptions } from 'i18next'

import { BackendError } from './backend-error'

/** 422 Unprocessable Entity */
export class InvalidClientRequestError<T = unknown> extends BackendError<T> {
  /**
   * @param message Error message for dev/debug/logging
   * @param i18n Message translation options for end users
   * @param data Extra data for clients
   */
  constructor(message?: string, i18n?: boolean | TOptions, data?: any) {
    super(invalidClientRequestError, message, i18n, data)
  }
}
