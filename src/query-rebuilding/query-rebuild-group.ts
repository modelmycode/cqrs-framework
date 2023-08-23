import {Type} from '../utils/lang'
import { Event } from 'axon-server-node-api'
import { Unsubscribable } from 'rxjs'

import { deserializeObject } from '../application/axon-serialization'
import { executeAxonHandler } from '../application/execute-axon-handler'
import { EventBuffer } from '../axon-event-processor/event-buffer'
import { AxonConnectionEventChannel } from '../axon-server-connector/channels/axon-connection-event-channel'
import { getEventHandlersInType } from '../event-sourcing/event-handler.decorator'
import { postgresDb } from '../framework-services'
import { logger } from '../logging/logger'
import { QueryDatabaseModel } from '../query-projector/query-database-model'
import { TypeInstanceMap } from '../utils/type-instance-map'

interface RebuildGroupSchema {
  id: string
  content: string
  eventToken?: number
  data?: any
}
export class QueryRebuildGroup {
  private readonly logger = logger.forContext(QueryRebuildGroup)

  private readonly eventBuffer = new EventBuffer()
  private readonly instanceMap = new TypeInstanceMap()
  private readonly projectorTypesByEvent = new Map<
    string,
    Array<{ type: Type; method: string }>
  >()

  private eventStream: Unsubscribable | null = null
  private processedToken = -1
  private isProcessingEvent = false
  private catchUpToken = -1
  private catchUpProgress = 0

  constructor(
    private readonly rebuildId: string,
    private readonly projectors: Type[],
    private readonly databaseModels: QueryDatabaseModel[],
  ) {}

  public async prepare() {
    if (this.projectors.length === 0) {
      throw new Error(`No projectors for rebuild ${this.rebuildId}`)
    }
    if (this.databaseModels.length === 0) {
      throw new Error(`No database models for rebuild ${this.rebuildId}`)
    }
    this.registerProjectors()

    for (const model of this.databaseModels) {
      await model.initDatabase()
    }
    await postgresDb.query(`CREATE TABLE IF NOT EXISTS "query-rebuild-groups" (\
"id" TEXT NOT NULL , \
"content" TEXT NOT NULL, \
"eventToken" INTEGER, \
"data" JSONB, \
"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, \
"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, \
PRIMARY KEY ("id"))`)

    const content = [
      ...this.projectors.map((v) => v.name),
      ...this.databaseModels.map((v) => v.tableName),
    ]
      .sort()
      .join('|')
    const findResult = await postgresDb.query(`SELECT \
"content", "eventToken" \
FROM "query-rebuild-groups" WHERE "id" = '${this.rebuildId}'`)
    const record = findResult?.[0] as Partial<RebuildGroupSchema> | null
    if (record) {
      if (record.content !== content) {
        throw new Error(
          `Duplicated rebuild ${this.rebuildId} with different contents`,
        )
      }
      if (record.eventToken && record.eventToken >= 0) {
        this.processedToken = record.eventToken
      }
    } else {
      await postgresDb.query(
        `INSERT INTO "query-rebuild-groups" \
("id","content","createdAt","updatedAt") VALUES ($1,$2,$3,$4)`,
        [this.rebuildId, content, new Date(), new Date()],
      )
    }
  }

  public async start(eventChannel: AxonConnectionEventChannel): Promise<void> {
    this.catchUpToken = await eventChannel.getLastToken()
    this.eventStream = eventChannel.listEvents({
      trackingToken: this.processedToken,
      next: (v) => {
        const promise = this.eventBuffer.add(v)
        this.checkProcessing()
        return promise
      },
    })
  }

  public async shutdown() {
    this.eventStream?.unsubscribe()
  }

  private checkProcessing() {
    if (this.isProcessingEvent) return

    const next = this.eventBuffer.peek()
    if (!next) return

    this.isProcessingEvent = true
    this.process(next.event.getEvent())
      .then((v) => this.saveProgress(next.event.getToken(), v))
      .then(
        () => {
          next.ack()
          this.eventBuffer.dequeue()
          this.isProcessingEvent = false
          this.checkProcessing()
        },
        (e) => {
          this.logger.error(e, true)
        },
      )
  }

  private async process(event: Event | undefined): Promise<boolean> {
    const payload = event?.getPayload()
    if (!event || !payload) return false

    const eventName = payload.getType()
    const projectorTypes = this.projectorTypesByEvent.get(eventName)
    if (!projectorTypes || projectorTypes.length === 0) return false

    await Promise.all(
      projectorTypes.map(async ({ type, method }) => {
        const handler = this.instanceMap.get(type)
        const eventId = event.getMessageIdentifier()
        return executeAxonHandler(
          `${type.name}.${method}( ${eventName}#${eventId} )`,
          () => handler[method](deserializeObject(payload)),
          'error',
          this.logger,
        ).catch((err) => {
          this.logger.error(`Error in event handler ${type.name}.${method}()`, {
            err,
            report: true,
          })
          // SequelizeUniqueConstraintError could be processed token failed to store.
          // Watch for errors on Sentry.
          if (err.name !== 'SequelizeUniqueConstraintError') {
            throw err
          }
        })
      }),
    )

    return true
  }

  private async saveProgress(token: number, hasProjector: boolean) {
    if (token === this.catchUpToken) {
      this.logger.log(`Catch up done @${token}`)
    } else if (this.catchUpToken > 0 && token < this.catchUpToken) {
      const progress = Math.floor((token / this.catchUpToken) * 1000) / 10
      if (progress > this.catchUpProgress) {
        this.catchUpProgress = progress
        this.logger.log(`Catch up: ${progress}% ${token}/${this.catchUpToken}`)
      }
    } else {
      this.logger.log(`Live process: ${token}`)
    }
    if (hasProjector) {
      await postgresDb.query(
        `UPDATE "query-rebuild-groups" \
SET "eventToken"=$1,"updatedAt"=$2 WHERE "id" = $3`,
        [token, new Date(), this.rebuildId],
      )
    }
  }

  private registerProjectors() {
    this.projectors.forEach((type) => {
      const entries = Object.entries(getEventHandlersInType(type))
      entries.forEach(([eventName, method]) => {
        this.projectorTypesByEvent.set(eventName, [
          ...(this.projectorTypesByEvent.get(eventName) || []),
          { type, method },
        ])
      })
    })
  }
}
