import { IncomingMessage, OutgoingMessage } from 'http'

import ecsFormat from '@elastic/ecs-winston-format'
import { AxiosError } from 'axios'
import { Colorizer } from 'logform'
import winston from 'winston'
import TransportStream from 'winston-transport'

import { isAxiosError } from '../utils/axios-utils'

export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug'

export interface LogMeta {
  /** The context the log message is in */
  context?: string
  /** The detailed location of the log message */
  location?: string
  /** The related http request */
  req?: IncomingMessage
  /** The related http response */
  res?: OutgoingMessage
  /** Extra data for debugging */
  debug?: any
  /** Log level, default to info */
  level?: LogLevel
}

export interface ErrorLogMeta extends LogMeta {
  /** The error to log */
  err?: Error
  /** Report to error tracking system. True or extra data. */
  report?: true | Record<string, any>
}

export interface Logger {
  /** Log in the default info level, or set different level in LogMeta.level. */
  log(message: string, contextOrMeta?: string | LogMeta): void

  /** Log in warn level */
  warn(message: string, contextOrMeta?: string | LogMeta): void

  /** Log in error level */
  error(err: string | Error): void
  /** Log in error level and set the log context */
  error(err: string | Error, context: string): void
  /** Log in error level and report to error tracking system */
  error(err: string | Error, report: true): void
  /** Log in error level with ErrorLogMeta */
  error(err: string | Error, meta: ErrorLogMeta): void

  /** Create a logger with a default context (and meta) */
  forContext(context: string | { name: string }, otherMeta?: any): Logger
}

/** The top level logger. Use logger.forContext() to create scoped loggers. */
export const logger: Logger = createLogger()

/** Config the logger. Call as early as possible in the main file of services. */
export function configLogger(
  production?:
    | false
    | {
        service: {
          name: string
          version: string
          build?: string
          id?: string
          type?: string
        }
      },
) {
  // === === === === === === === === === === === === === === === === === === ===
  // Code below this line in this file are all private implementation details

  isProduction = !!production
  if (production) {
    const exp = /^@eb-framework\/(.*?)(-service)?$/
    const shortname = (production.service.name || '').match(exp)?.[1]
    winstonLogger.configure({
      level: 'info',
      defaultMeta: { service: { ...production.service, shortname } },
      format: combine(productionFormat(), ecsFormat()),
      transports: [new winston.transports.Console()],
    })
  } else {
    winstonLogger.configure({ transports: [new LocalConsole()] })
  }
}

function createLogger(meta?: Record<string, any>): Logger {
  return {
    log: (message, contextOrMeta) => log(message, contextOrMeta, meta),
    warn: (message, contextOrMeta) => log(message, contextOrMeta, meta, 'warn'),
    error: (err: string | Error, other?: string | true | ErrorLogMeta) =>
      error(err, other, meta),
    forContext: (context, otherMeta) =>
      createLogger({
        ...meta,
        ...otherMeta,
        context: typeof context === 'string' ? context : context.name,
      }),
  } as Logger
}

let isProduction = false
const winstonLogger = winston.createLogger({})
const log = (
  message: string,
  contextOrMeta?: string | LogMeta,
  defaultMeta?: Record<string, any>,
  logLevel?: LogLevel,
) => {
  const meta: LogMeta & Record<string, any> = { ...defaultMeta }
  if (contextOrMeta) {
    if (typeof contextOrMeta === 'string') {
      meta.context = contextOrMeta
    } else {
      Object.assign(meta, contextOrMeta)
    }
  }
  if (logLevel) {
    meta.level = logLevel
  }
  const { level, ...otherMeta } = meta
  winstonLogger.log({
    ...otherMeta,
    level: level || 'info',
    message,
  })
}
const error = (
  msgOrErr: string | Error,
  other?: string | true | ErrorLogMeta,
  defaultMeta?: Record<string, any>,
) => {
  const [message, err]: [string, Error?] =
    typeof msgOrErr === 'string' ? [msgOrErr] : [msgOrErr.message, msgOrErr]
  const meta: ErrorLogMeta = { err }

  let reportError: boolean | Record<string, any> = false
  if (other) {
    if (other === true) {
      reportError = true
      log(message, meta, defaultMeta, 'error')
    } else if (typeof other === 'string') {
      meta.context = other
      log(message, meta, defaultMeta, 'error')
    } else {
      const { report, ...otherMeta } = other
      if (report) {
        reportError = report === true ? {} : report
        if (otherMeta.err) {
          reportError.err = err || otherMeta.err
        }
      }
      log(message, { ...meta, ...otherMeta }, defaultMeta, 'error')
    }
  } else {
    log(message, meta, defaultMeta, 'error')
  }

  if (!isProduction) return
  if (reportError) {
    reportToSentry({
      message,
      err,
      context: meta.context,
      ...defaultMeta,
      ...(reportError === true ? {} : reportError),
    })
  }
}

const { combine, timestamp, colorize } = winston.format

/** Filter out debug fields for production reformat for ecs. */
const productionFormat = winston.format((info) => {
  delete info.debug
  delete info.req
  delete info.res

  info.label = {
    ...info.label,
    context: info.context,
  }
  delete info.context

  return info
})

class LocalConsole extends TransportStream {
  private readonly colorizer: Colorizer

  constructor() {
    super({ format: timestamp({ format: 'HH:mm:ss' }) })

    winston.addColors({
      error: 'red',
      warn: 'yellow',
      info: 'green',
      debug: 'green',
    })
    this.colorizer = colorize()
  }

  public log(info: LogMeta & Record<string, any>, next: () => void) {
    setImmediate(() => this.emit('logged', info))

    const parts = [
      info.timestamp,
      info.context && `${this.colorizer.colorize('warn', `[${info.context}]`)}`,
      info.location && `[${info.location}]`,
      this.colorizer.colorize(info.level || 'info', info.message),
    ]
    const message = parts.filter(Boolean).join(' ')
    if (info.level === 'error') {
      console.error(message)
      if (info.err) {
        console.error(
          isAxiosError(info.err) ? formatAxiosError(info.err) : info.err,
        )
      }
    } else if (info.level === 'warn') {
      console.warn(message)
    } else {
      console.log(message)
    }
    if (info.debug) {
      console.log(info.debug)
    }
    if (info.req) {
      console.log('  --- request ---')
      console.log(info.req)
    }
    if (info.res) {
      console.log('  --- response ---')
      console.log(info.res)
    }

    next?.()
  }
}

function reportToSentry({
  message,
  err,
  ...extras
}: {
  message: string
  err: Error | undefined
} & Record<string, any>) {
//
}

function formatAxiosError(err: AxiosError) {
  return {
    url: `[${err.config.method}] ${err.config.url}`,
    request: err.config.data,
    status: err.response?.status,
    response: err.response?.data,
  }
}
