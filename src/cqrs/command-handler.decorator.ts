import 'reflect-metadata'

import { Type } from '../utils/lang'

import {
  HandlersInType,
  handlerMethodDecorator,
} from '../utils/handler-method-decorator'

const commandHandlerKey = 'framework:commandHandler'

/**
 * Register a command handler method
 *
 * @example @commandHandler() createFoo(command: CreateFooCommand)
 * @example @commandHandler(DeleteFooCommand) deleteFoo()
 */
export function commandHandler(command?: { name: string }): MethodDecorator {
  return handlerMethodDecorator(commandHandlerKey, command?.name)
}

export function getCommandHandlersInType(handler: Type): HandlersInType {
  return Reflect.getMetadata(commandHandlerKey, handler.prototype) || {}
}
