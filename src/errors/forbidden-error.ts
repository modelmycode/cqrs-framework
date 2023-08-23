import { forbiddenError } from '..'
import { TOptions } from 'i18next'

import { BackendError } from './backend-error'

/** 403 Forbidden */
export class ForbiddenError extends BackendError {
  /**
   * @param message Error message for dev/debug/logging
   * @param i18n Message translation options for end users
   * @param data Extra data for clients
   */
  constructor(message?: string, i18n?: boolean | TOptions, data?: any) {
    super(forbiddenError, message, i18n, data)
  }
}
