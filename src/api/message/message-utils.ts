import { Type } from '../../utils/lang'

import { Command, RespondingCommand } from './command.interface'
import { Event } from './event.interface'
import { Query } from './query.interface'

/** Build a message (Command/Event/Query) with type and value. */
export function buildMessage<
  T extends Event | Query | Command | RespondingCommand,
>(type: Type<T>, value: Omit<T, '$responseType'>): T {
  return Object.assign(value, { constructor: type }) as unknown as T
}

/** Clear mock constructor for passing type from `buildMessage()`. */
export function clearBuildMessage(value: any) {
  if (Object.prototype.hasOwnProperty.call(value, 'constructor')) {
    const clone = { ...value }
    delete clone.constructor
    return clone
  }
  return value
}

export function isMessageType<
  T extends Event | Query | Command | RespondingCommand,
>(type: Type<T>, value: any): value is T {
  return value?.constructor?.name === type.name
}