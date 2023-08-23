
import { EventMetadata } from '../event-sourcing/aggregate-event-sourcing'

export interface EventDetails {
  eventName: string
  metadata: EventMetadata
  timestamp: number
  aggregateType?: string | null
}

export interface EventHandler<T extends Event> {
  (event: T, details?: EventDetails): Promise<void>
}
