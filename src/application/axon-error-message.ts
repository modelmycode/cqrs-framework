import { ErrorMessage } from 'axon-server-node-api'

import { BackendError } from '../errors/backend-error'
import { logger } from '../logging/logger'

/** BackendError to Axon ErrorMessage */
export function toErrorMessage(error: BackendError): ErrorMessage {
  return new ErrorMessage()
    .setErrorCode(error.code)
    .setMessage(error.message)
    .setLocation(error.stack || '')
    .setDetailsList([JSON.stringify(error.i18n), JSON.stringify(error.data)])
}

/** Axon ErrorMessage to BackendError */
export function fromErrorMessage(errorMessage: ErrorMessage): BackendError {
  const detailAt = (index: number) => {
    const value = errorMessage.getDetailsList()[index]
    if (value) {
      try {
        return JSON.parse(value)
      } catch (e) {
        logger.error(e, { report: true, context: 'framework' })
      }
    }
  }

  const error = new BackendError(
    errorMessage.getErrorCode(),
    errorMessage.getMessage(),
    detailAt(0),
    detailAt(1),
  )
  error.stack = errorMessage.getLocation()
  return error
}
