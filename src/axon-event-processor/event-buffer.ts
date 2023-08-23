import { EventWithToken } from 'axon-server-node-api'

type TrackedEventMessage = {
  event: EventWithToken
  ack: () => void
}

export class EventBuffer {
  private readonly eventStream: TrackedEventMessage[] = []

  public add(event: EventWithToken) {
    return new Promise<void>((ack) =>
      this.eventStream.push({
        event,
        ack,
      }),
    )
  }

  public isEmpty() {
    return this.eventStream.length === 0
  }

  public peek(): TrackedEventMessage | null {
    return this.isEmpty() ? null : this.eventStream[0]
  }

  public dequeue(): TrackedEventMessage | undefined {
    return this.eventStream.shift()
  }
}
