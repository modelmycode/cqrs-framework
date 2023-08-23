import 'reflect-metadata'

import {Type} from '../utils/lang'

import {
  HandlersInType,
  handlerMethodDecorator,
} from '../utils/handler-method-decorator'

const eventHandlerKey = 'framework:eventHandlers'

/**
 * Register a event handler method
 *
 * @example @eventHandler(FooDeleted) onFooDeleted()
 * @example @eventHandler() onFooCreated(event: FooCreated)
 */
export function eventHandler(
  event?: { name: string } | Array<{ name: string }>,
): MethodDecorator {
  if (!event) return handlerMethodDecorator(eventHandlerKey)

  return handlerMethodDecorator(
    eventHandlerKey,
    Array.isArray(event) ? event.map((e) => e.name) : event.name,
  )
}

export function getEventHandlersInType(handler: Type): HandlersInType {
  return Reflect.getMetadata(eventHandlerKey, handler.prototype) || {}
}
