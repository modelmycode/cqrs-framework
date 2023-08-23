import 'reflect-metadata'

import { handlerMethodDecorator } from '../utils/handler-method-decorator'
import { AggregateRoot } from './aggregate-root'

export const eventSourcingHandlersKey = 'framework:eventSourcingHandlers'

/**
 * Register an event sourcing handler method on an AggregateRoot class.
 * The event sourcing handler will be passed in the event and timestamp.
 *
 * @example @eventSourcingHandler(FooEvent) onFoo() {}
 * @example @eventSourcingHandler() onFoo(event: FooEvent) {}
 * @example @eventSourcingHandler() onFoo(event: FooEvent, timestamp: number) {}
 */
export function eventSourcingHandler(event?: { name: string }) {
  return handlerMethodDecorator(eventSourcingHandlersKey, event?.name)
}

export function getEventSourcingHandlerName(
  aggregateRoot: AggregateRoot,
  eventName: string,
): string | null {
  const handlers = Reflect.getMetadata(
    eventSourcingHandlersKey,
    aggregateRoot.constructor.prototype,
  )
  return handlers ? handlers[eventName] || null : null
}
