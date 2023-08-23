import { BackendError } from '../errors/backend-error'
import { logger } from '../logging/logger'

const scopedLogger = logger.forContext('Axon', {
  location: 'executeAxonHandler',
})

export const handlerTimeoutCode = 'HANDLER-TIMEOUT'
const timeoutDuration = 30_000

/** Run an axon command/query/event handlers with timeout */
export function executeAxonHandler<TResult = void>(
  name: string,
  execute: () => Promise<TResult>,
  log: 'all' | 'error' | 'off' = 'all',
  logger = scopedLogger,
): Promise<TResult> {
  return new Promise((resolve, reject) => {
    let isTimeout = false
    const timeoutId = setTimeout(() => {
      isTimeout = true
      reject(new BackendError(handlerTimeoutCode))
    }, timeoutDuration)

    if (log === 'all') {
      logger.log(`${name} - started`)
    }
    const ts = Date.now()
    const finish = (apply: () => void) => {
      const duration = Date.now() - ts
      if (isTimeout) {
        if (log !== 'off') {
          logger.error(`${name} - timeout (${duration}ms)`)
        }
      } else {
        if (log === 'all') {
          logger.log(`${name} - finished (${duration}ms)`)
        }
        clearTimeout(timeoutId)
        apply()
      }
    }

    execute().then(
      (result) => finish(() => resolve(result)),
      (error) => finish(() => reject(error)),
    )
  })
}
