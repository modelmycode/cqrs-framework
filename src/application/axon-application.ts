import {CommandResponse, QueryResponse} from 'axon-server-node-api'
import {DatabaseError} from 'pg'
import {from} from 'rxjs'

import {TrackingEventProcessor} from '../axon-event-processor/tracking-event-processor'
import {TrackingTokenStore} from '../axon-event-processor/tracking-token-store'
import {AxonServerConnectionFactory} from '../axon-server-connector/axon-server-connection-factory'
import {
  AxonServerConnectionOptions,
  AxonServerContextConnection,
} from '../axon-server-connector/axon-server-context-connection'
import {getCommandHandlersInType} from '../cqrs/command-handler.decorator'
import {getQueryHandlersInType} from '../cqrs/query-handler.decorator'
import {DatabaseModel} from '../database/database-model'
import {PostgresConfig} from '../database/postgres-db'
import {BackendError} from '../errors/backend-error'
import {EventMetadata} from '../event-sourcing/aggregate-event-sourcing'
import {
  automationFactory,
  messageBus,
  postgresDb,
} from '../framework-services'
import {logger} from '../logging/logger'
import {TypeInstanceMap} from '../utils/type-instance-map'
import {validateAuthToken} from './access-guards/validate-auth-token'
import {AxonAggregateEventSourcing} from './axon-aggregate-event-sourcing'
import {toErrorMessage} from './axon-error-message'
import {serializeObject} from './axon-serialization'
import {CommandContext} from './command-context'
import {executeAxonHandler} from './execute-axon-handler'
import {decodeCommandWithHeaders} from './headers/command-headers'
import {decodeQueryWithHeaders} from './headers/query-headers'
import {commandSchemas} from "../api/message/command-schemas";
import {commandSchemaError} from "../api/error/common-error";
import {errorCode} from "../api/error/error-code";
import {Type} from "../utils/lang";
import {ZodError, ZodSchema} from "zod";

interface AxonAppConfig {
  connection: AxonServerConnectionOptions

  commandHandlers?: Type[]
  queryHandlers?: Type[]
  queryProjectors?: Type[]
  processors?: Type[]
  eventHandlers?: Type[]

  eventProcessor?: {
    /** If to queue event handlers, or run handlers for the same event in parallel */
    queueHandlers?: boolean

    /** If it is a new service, if to replay history events from -1, or only the newer events. */
    replayHistory?: boolean
  }

  database?: {
    postgres?: PostgresConfig
    models?: DatabaseModel[]
  }

  checkJwtHeader?: boolean
}

export class AxonApplication {
  private readonly logger = logger.forContext('Axon')

  private connectionFactory = new AxonServerConnectionFactory(
    this.config.connection,
    this.logger,
  )
  private handlerInstances = new TypeInstanceMap()
  private eventProcessors: TrackingEventProcessor[] = []

  constructor(private readonly config: AxonAppConfig) {
  }

  public async connect(): Promise<AxonServerContextConnection> {
    const connection = await this.connectionFactory.connect(
      this.config.connection.context || 'default',
    )
    await messageBus.connect(connection)

    const {commandHandlers, queryHandlers, processors} = this.config
    const eventHandlers = Array.from(
      new Set([
        ...(processors || []),
        ...(this.config.queryProjectors || []),
        ...(this.config.eventHandlers || []),
      ]),
    )

    // -- DB
    if (this.config.database) {
      const {postgres, models} = this.config.database
      if (postgres) {
        await postgresDb.connect(postgres)
          .then(() => this.logger.log(`${this.config.database?.postgres?.database ?? ''} connected`))
          .catch((e) => this.logger.error(e))
      }
      for (const model of models || []) {
        await model.initDatabase()
      }
    }

    // -- Command
    if (commandHandlers && commandHandlers.length > 0) {
      const eventSourcing = new AxonAggregateEventSourcing()
      await eventSourcing.connect(connection)
      await this.registerCommandHandlers(
        connection,
        commandHandlers,
        eventSourcing,
      )
    }

    // -- Query
    if (queryHandlers && queryHandlers.length > 0) {
      await this.registerQueryHandlers(connection, queryHandlers)
    }

    // -- Event & Automation
    if (eventHandlers.length > 0) {
      if (!this.config.database?.postgres)
        throw new Error('Event handling requires postgres database config')

      const eventProcessor = await this.registerEventHandlers(
        connection,
        eventHandlers,
      )

      if (processors && processors.length > 0) {
        await automationFactory.initDatabase()
        automationFactory.init((name) => {
          const type = processors.find((v) => v.name === name)
          return type ? this.handlerInstances.get(type) : null
        }, eventProcessor.isActive$)
      }
    }

    return connection
  }

  public async shutdown(): Promise<void> {
    this.connectionFactory.shutdown()
    this.eventProcessors.forEach((v) => v.shutdown())
    await postgresDb.disconnect()
  }

  private async registerCommandHandlers(
    connection: AxonServerContextConnection,
    handlers: Type[],
    eventSourcing: AxonAggregateEventSourcing,
  ) {
    new Set(handlers).forEach((handlerType) => {
      const handlers = getCommandHandlersInType(handlerType)
      Object.keys(handlers).forEach((commandName) => {
        const methodName = handlers[commandName]
        connection.commandChannel.registerCommandHandler(
          commandName,
          async (command) => {
            const commandId = command.getMessageIdentifier()
            const handler = this.handlerInstances.get(handlerType)

            const request = decodeCommandWithHeaders(command)

            let schema = commandSchemas.get(commandName)
            if (typeof schema === 'function') {
              schema = schema()
            }

            try {
              const payload = schema
                ? await schema.parse(request.payload,)
                : request.payload

              const headers = await validateAuthToken(
                request.headers,
                commandName,
                payload,
                this.config.checkJwtHeader,
              )

              const metadata: EventMetadata = {}
              if (headers.token) {
                metadata.personId = headers.token.user.userId
              }
              const context: CommandContext = {
                headers,
                eventSourcing: eventSourcing.forContext(metadata),
              }

              const result = await executeAxonHandler(
                `${handlerType.name}.${methodName}( ${commandName}#${commandId} )`,
                () => handler[methodName](payload, context),
                'all',
                this.logger.forContext('CommandHandler'),
              )

              if (result !== undefined && result !== null) {
                return new CommandResponse().setPayload(
                  serializeObject(result as any),
                )
              } else {
                return new CommandResponse()
              }
            } catch (error) {
              const message =
                error instanceof ZodError
                  ? toErrorMessage(
                    new BackendError(
                      commandSchemaError,
                      error.message,
                      false,
                      {type: error.name, path: error.stack},
                    ),
                  )
                  : toErrorMessage(error)
              return new CommandResponse()
                .setErrorCode(message.getErrorCode())
                .setErrorMessage(message)
            }
          },
          100,
        )
      })
    })
  }

  private registerQueryHandlers(
    connection: AxonServerContextConnection,
    handlers: Type[],
  ) {
    new Set(handlers).forEach((handlerType) => {
      const handlers = getQueryHandlersInType(handlerType)
      Object.keys(handlers).forEach((queryName) => {
        const methodName = handlers[queryName]
        connection.queryChannel.registerQueryHandler(queryName, (query) => {
          const queryId = query.getMessageIdentifier()
          const handler = this.handlerInstances.get(handlerType)

          const request = decodeQueryWithHeaders(query)
          return from(
            validateAuthToken(
              request.headers,
              queryName,
              request.payload,
              this.config.checkJwtHeader,
            )
              .then((headers) =>
                executeAxonHandler<any>(
                  `${handlerType.name}.${methodName}( ${queryName}#${queryId} )`,
                  () => handler[methodName](request.payload, headers),
                  'all',
                  this.logger.forContext('QueryHandler'),
                ),
              )
              .then((result) =>
                result !== undefined && result !== null
                  ? new QueryResponse().setPayload(serializeObject(result))
                  : new QueryResponse(),
              )
              .catch((error) => {
                if (error instanceof DatabaseError) {
                  this.logger.error(error, true)
                  error = new BackendError(
                    errorCode('postgres', error.code || '', 'server'),
                    error.message,
                  )
                }
                const message = toErrorMessage(error)
                return new QueryResponse()
                  .setErrorCode(message.getErrorCode())
                  .setErrorMessage(message)
              }),
          )
        })
      })
    })
  }

  private async registerEventHandlers(
    connection: AxonServerContextConnection,
    handlers: Type[],
  ): Promise<TrackingEventProcessor> {
    const trackingTokenStore = new TrackingTokenStore()
    await trackingTokenStore.initDatabase()

    const clientIdentification = this.config.connection.clientIdentification
    const eventProcessor = new TrackingEventProcessor(
      `event-processor`,
      clientIdentification.getClientId(),
      clientIdentification.getComponentName(),
      connection.eventChannel,
      trackingTokenStore,
      (type) => this.handlerInstances.get(type),
      handlers,
      this.config.eventProcessor?.queueHandlers,
      this.config.eventProcessor?.replayHistory,
    )
    this.eventProcessors.push(eventProcessor)
    await eventProcessor.start()
    return eventProcessor
  }
}