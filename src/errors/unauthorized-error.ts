import { unauthorizedError } from '..'
import { TOptions } from 'i18next'

import { BackendError } from './backend-error'

/** 401 Unauthorized */
export class UnauthorizedError extends BackendError {
  /**
   * @param message Error message for dev/debug/logging
   * @param i18n Message translation options for end users
   * @param data Extra data for clients
   */
  constructor(message?: string, i18n?: boolean | TOptions, data?: any) {
    super(unauthorizedError, message, i18n, data)
  }
}
