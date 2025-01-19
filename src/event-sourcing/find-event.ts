import { Event, } from '../api/message/event.interface'
import {isMessageType} from '../api/message/message-utils'
import {Type} from '../utils/lang'

export function findEvent<T extends Event>(
  events: Event[],
  eventType: Type<T>,
): T | null {
  for (const event of events) {
    if (isMessageType(eventType, event)) {
      return event
    }
  }
  return null
}