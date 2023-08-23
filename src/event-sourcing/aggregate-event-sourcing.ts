import { Event } from '..'
import { Type } from '../utils/lang'

import { logger } from '../logging/logger'
import { AggregateRoot } from './aggregate-root'
import { getEventSourcingHandlerName } from './event-sourcing-handler.decorator'

export interface EventMetadata {
  [key: string]: string | number | boolean | undefined
}

interface AggregateEvent {
  payload: Event
  name: string
  timestamp: number
  metadata?: EventMetadata
}

interface EventMessage {
  aggregateType: string
  aggregateIdentifier: string
  event: AggregateEvent
  sequenceNumber: number
}

interface EventStore {
  load(aggregateIdentifier: string): Promise<AggregateEvent[]>

  publish(events: Array<EventMessage>): Promise<void>
}

export class AggregateConcurrencyError extends Error {}

export class AggregateEventSourcing {
  constructor(private readonly eventStore: EventStore) {}

  /** Create a new aggregate with a create command. */
  public async create<T extends AggregateRoot>(
    type: Type<T>,
    aggregateIdentifier: string,
    command: (aggregate: T) => Promise<void> | void,
  ): Promise<Event[]> {
    const events = await this.execute(new type(), command)
    return this.publish(type.name, aggregateIdentifier, 0, events)
  }

  /**
   * Load an existing aggregate instance by id and then execute a command.
   * The command has no side effects outside of the aggregate,
   * so can be executed again in case of concurrency error.
   * Provide a 4th guard method parameter to only trigger side effects once.
   */
  public async load<T extends AggregateRoot>(
    type: Type<T>,
    aggregateId: string,
    command: (aggregate: T) => Promise<void> | void,
  ): Promise<Event[]>
  /**
   * Load an existing aggregate instance by id and then execute a command.
   * The command has external side effects outside of the aggregate,
   * e.g. sending an email out, so cannot be executed again in case of
   * concurrency error. A guard method on the aggregate is called for validating
   * the aggregate state, and if no errors threw, the events from the first call
   * will be published without triggering the side effects again.
   *
   * @param type          The aggregate type.
   * @param aggregateId   The aggregate identifier.
   * @param command       The command to run on the aggregate with side effects.
   * @param guard         The guard method to run on the aggregate for
   *                      validating the aggregate state. Throw an error if the
   *                      validation fails. Do not include any side effects.
   * @param rollback      Optional method to rollback the side effects if possible.
   *                      Will be called with the events failed to publish after
   *                      failing the validation on the new aggregate state.
   */
  public async load<T extends AggregateRoot>(
    type: Type<T>,
    aggregateId: string,
    command: (aggregate: T) => Promise<void> | void,
    guard: (aggregate: T) => Promise<void> | void,
    rollback?: (events: Event[]) => void,
  ): Promise<Event[]>
  public async load<T extends AggregateRoot>(
    type: Type<T>,
    aggregateId: string,
    command: (aggregate: T) => Promise<void> | void,
    guard?: (aggregate: T) => Promise<void> | void,
    rollback?: (events: Event[]) => void,
  ): Promise<Event[]> {
    const fromHistory = async (): Promise<[T, number]> => {
      const history = await this.eventStore.load(aggregateId)
      if (history.length === 0) {
        throw new Error(`Aggregate ${type.name}#${aggregateId} not found`)
      }

      const aggregate = new type()
      history.forEach((e) => invokeEventSourcingHandler(aggregate, e))
      return [aggregate, history.length]
    }

    const maxTries = 3
    const retryGuarded = async (
      tryTimes: number,
      events: AggregateEvent[],
    ): Promise<Event[]> => {
      const [aggregate, version] = await fromHistory()
      try {
        await guard?.(aggregate)
      } catch (err) {
        logger.error(`Failed to publish guarded events on ${type.name}`, {
          err,
          report: { events },
          context: AggregateEventSourcing.name,
        })
        rollback?.(events.map((v) => v.payload))
        throw err
      }
      try {
        return await this.publish(type.name, aggregateId, version, events)
      } catch (e) {
        if (e instanceof AggregateConcurrencyError && ++tryTimes < maxTries) {
          return retryGuarded(tryTimes, events)
        }
        throw e
      }
    }

    const tryExecute = async (tryTimes = 0): Promise<Event[]> => {
      const [aggregate, version] = await fromHistory()
      await guard?.(aggregate)
      const events = await this.execute(aggregate, command)
      try {
        return await this.publish(type.name, aggregateId, version, events)
      } catch (e) {
        if (e instanceof AggregateConcurrencyError && ++tryTimes < maxTries) {
          return guard ? retryGuarded(tryTimes, events) : tryExecute(tryTimes)
        }
        throw e
      }
    }
    return tryExecute()
  }

  private async execute<T extends AggregateRoot>(
    aggregate: T,
    command: (aggregate: T) => Promise<void> | void,
  ): Promise<AggregateEvent[]> {
    const events: AggregateEvent[] = []
    const subscription = aggregate.events$.subscribe((payload) => {
      const name = payload.constructor.name
      const event: AggregateEvent = { payload, name, timestamp: Date.now() }
      events.push(event)
      invokeEventSourcingHandler(aggregate, event)
    })

    try {
      await command(aggregate)
      subscription.unsubscribe()
    } catch (e) {
      subscription.unsubscribe()
      throw e
    }

    return events
  }

  private async publish(
    aggregateType: string,
    aggregateIdentifier: string,
    sequenceNumberStart: number,
    events: AggregateEvent[],
  ): Promise<Event[]> {
    await this.eventStore.publish(
      events.map((event, index) => ({
        event,
        aggregateType,
        aggregateIdentifier,
        sequenceNumber: sequenceNumberStart + index,
      })),
    )
    return events.map((v) => v.payload)
  }
}

function invokeEventSourcingHandler<T extends AggregateRoot>(
  aggregate: T,
  event: AggregateEvent,
): void {
  const handlerName = getEventSourcingHandlerName(aggregate, event.name)
  if (!handlerName) return // Event sourcing handlers are not required for all events

  const handler = (aggregate as any)[handlerName]
  handler.call(aggregate, event.payload, event.timestamp)
}
