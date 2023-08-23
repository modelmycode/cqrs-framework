import {Command, Event, isMessageType, Query, RespondingCommand} from '..'
import {Type} from '../utils/lang'

export function findEvent<T extends Event>(
  events: Event[],
  eventType: Type<T>,
): Event | Query<any> | Command | RespondingCommand<any> | null{
  for (const event of events) {
    if (isMessageType(eventType, event)) {
      return event
    }
  }
  return null
}
