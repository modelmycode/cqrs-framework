import { createHttpTerminator } from './http-terminator'

const sendMessage = (message: any) => {
  if (process && process.send) {
    process?.send(message)
  }
}

const testCaseLogger = {
  log: (message: any, context?: string) => {
    sendMessage(message)
  },
  error: (message: any, trace?: string, context?: string) => {
    sendMessage(message)
  },
  warn: (message: any, context?: string) => {
    sendMessage(message)
  },
}

const testCaseApp = {
  throwUncaughtException: () => {
    throw Error(`UncaughtException`)
  },
  throwUnhandledRejection: () => {
    Promise.reject('UnhandledRejection')
  },
  close: (): Promise<void> =>
    new Promise((resolve) => {
      testCaseLogger.log('application close')
      resolve()
    }),
}

createHttpTerminator({
  app: testCaseApp,
  logger: testCaseLogger,
})

process.on('message', (message) => {
  if (message === 'throwUncaughtException') {
    testCaseApp.throwUncaughtException()
  } else if (message === 'throwUnhandledRejection') {
    testCaseApp.throwUnhandledRejection()
  }
})
