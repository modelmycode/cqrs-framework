import 'reflect-metadata'

import { Type } from '../utils/lang'

import {
  HandlersInType,
  handlerMethodDecorator,
} from '../utils/handler-method-decorator'

const queryHandlerKey = 'framework:queryHandlers'

/**
 * Register a query handler method
 *
 * @example @queryHandler() onGetFoo(query: GetFooQuery)
 * @example @queryHandler(GetFirstFooQuery) onGetFirstFoo()
 */
export function queryHandler(query?: { name: string }): MethodDecorator {
  return handlerMethodDecorator(queryHandlerKey, query?.name)
}

export function getQueryHandlersInType(handler: Type): HandlersInType {
  return Reflect.getMetadata(queryHandlerKey, handler.prototype) || {}
}
