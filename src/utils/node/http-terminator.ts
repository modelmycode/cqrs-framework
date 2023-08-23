export interface ClosableApplication {
  close: () => Promise<void>
}

export interface LoggerService {
  log(message: any, context?: string): any
  error(message: any, trace?: string, context?: string): any
  warn(message: any, context?: string): any
}

interface HttpTerminatorOptions {
  app: ClosableApplication
  logger: LoggerService
}

export const createHttpTerminator = ({
  app,
  logger,
}: HttpTerminatorOptions) => {
  const createTerminator = (signal: number, message: string) => async () => {
    const log = (value: string) =>
      signal ? logger.error(value) : logger.warn(value)

    setTimeout(() => {
      logger.error(`${message} - application close timeout - force exit`)
      process.exit(signal)
    }, 4000).unref()

    log(`${message} - application closing`)
    await app.close()

    log(`${message} - application closed`)
    process.exit(signal)
  }

  process.on('uncaughtException', createTerminator(1, 'Uncaught Exception'))
  process.on('unhandledRejection', createTerminator(1, 'Unhandled Rejection'))
  process.on('SIGTERM', createTerminator(0, 'SIGTERM'))
  process.on('SIGINT', createTerminator(0, 'SIGINT'))

  logger.log(`Process terminator event handlers added`)
}
