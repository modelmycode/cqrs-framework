import { Event } from 'axon-server-node-api'
import { firstValueFrom } from 'rxjs'
import { toArray } from 'rxjs/operators'

import { AxonServerContextConnection } from '../axon-server-connector/axon-server-context-connection'
import {
  AggregateConcurrencyError,
  AggregateEventSourcing,
  EventMetadata,
} from '../event-sourcing/aggregate-event-sourcing'
import { logger } from '../logging/logger'
import { axonMetadataValue } from './axon-metadata'
import { deserializeObject, serializeObject } from './axon-serialization'
import * as crypto from "node:crypto";

export class AxonAggregateEventSourcing extends AggregateEventSourcing {
  private readonly logger = logger.forContext('EventSourcing')

  public async connect(connection: AxonServerContextConnection): Promise<void> {
    this.connection = connection
    await connection.connect()
  }

  public forContext(contextMetadata: EventMetadata) {
    return new AxonAggregateEventSourcing(this.connection, contextMetadata)
  }

  constructor(
    private connection: AxonServerContextConnection | null = null,
    contextMetadata?: EventMetadata,
  ) {
    super({
      load: (aggregateId) =>
        this.loadAxonEvents(aggregateId).then((v) =>
          v.map((event) => {
            const payload = event.getPayload()!
            return {
              payload: deserializeObject(payload),
              name: payload.getType(),
              timestamp: event.getTimestamp(),
            }
          }),
        ),
      publish: (events) =>
        this.publishAxonEvents(
          events.map((msg) => {
            const event = new Event()
              .setMessageIdentifier(crypto.randomUUID())
              .setAggregateType(msg.aggregateType)
              .setAggregateIdentifier(msg.aggregateIdentifier)
              .setAggregateSequenceNumber(msg.sequenceNumber)
              .setTimestamp(msg.event.timestamp)
              .setPayload(serializeObject(msg.event.payload, msg.event.name))

            attachEventMetadata(event, {
              ...contextMetadata,
              ...msg.event.metadata,
            })

            return event
          }),
        ),
    })
  }

  private async loadAxonEvents(aggregateId: string): Promise<Event[]> {
    if (!this.connection) throw new Error('Event store not connected')
    return firstValueFrom(
      this.connection.eventChannel
        .openAggregateStream(aggregateId)
        .pipe(toArray()),
    )
  }

  private async publishAxonEvents(events: Event[]) {
    if (!this.connection) throw new Error('Event store not connected')
    try {
      await this.connection.eventChannel.appendEvents(events)
      this.logger.log(
        `Published ${events.map((v) => v.getPayload()?.getType()).join(',')}`,
      )
    } catch (e) {
      if (e?.message && /AXONIQ-2000/i.test(e.message)) {
        throw new AggregateConcurrencyError(e.message)
      }
      throw e
    }
  }
}

function attachEventMetadata(event: Event, metadata: EventMetadata) {
  const keys = Object.keys(metadata)
  if (keys.length === 0) return

  const map = event.getMetaDataMap()
  keys.forEach((key) => map.set(key, axonMetadataValue(metadata, key)))
}
