import { AggregateEventSourcing } from '../event-sourcing/aggregate-event-sourcing'
import { CommandHeaders } from './headers/command-headers'

export interface CommandContext {
  headers: CommandHeaders
  eventSourcing: AggregateEventSourcing
}
