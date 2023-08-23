import {
  CancelScheduledEventRequest,
  ClientIdentification,
  Event,
  EventScheduler,
  EventStore,
  GetAggregateEventsRequest,
  GetFirstTokenRequest,
  GetLastTokenRequest,
  GetTokenAtRequest,
  ReadHighestSequenceNrRequest,
  RescheduleEventRequest,
  ScheduleEventRequest,
} from 'axon-server-node-api'
import { Observable, Unsubscribable } from 'rxjs'
import { v4 as uuid } from 'uuid'

import { AxonServerConnectorLogger } from '../axon-server-connector-logger'
import {
  AxonServiceClientInit,
  createEventSchedulerClient,
  createEventStoreClient,
} from '../axon-service-clients'
import {
  AxonListEventOptions,
  AxonListEventStream,
} from '../utils/axon-list-event-stream'

export class AxonConnectionEventChannel {
  private readonly clientId: string
  private readonly componentName: string
  private eventStoreClient: EventStore
  private eventSchedulerClient: EventScheduler
  private openStreams = new Set<AxonListEventStream>()
  private isDisconnected = false

  constructor(
    serviceClientInit: AxonServiceClientInit,
    clientIdentification: ClientIdentification,
    private readonly logger: AxonServerConnectorLogger,
  ) {
    this.clientId = clientIdentification.getClientId()
    this.componentName = clientIdentification.getComponentName()
    this.eventStoreClient = createEventStoreClient(serviceClientInit)
    this.eventSchedulerClient = createEventSchedulerClient(serviceClientInit)
  }

  public reconnect(serviceClientInit: AxonServiceClientInit): void {
    this.disconnect()

    this.isDisconnected = false // Connecting again
    this.eventStoreClient = createEventStoreClient(serviceClientInit)
    this.eventSchedulerClient = createEventSchedulerClient(serviceClientInit)
    this.openStreams.forEach((v) => v.open(this.eventStoreClient))
  }

  public disconnect(): void {
    if (this.isDisconnected) return

    this.openStreams.forEach((v) => v.end())
    this.eventStoreClient.close()

    this.isDisconnected = true
  }

  /**
   * Gets the highest sequence number for a specific aggregate.
   *
   * @param aggregateId         The Identifier of the Aggregate for which to load events
   * @param fromSequenceNumber  The Sequence Number of the first event expected
   */
  public readHighestSequenceNumber(
    aggregateId: string,
    fromSequenceNumber = 0,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const request = new ReadHighestSequenceNrRequest()
        .setAggregateId(aggregateId)
        .setFromSequenceNr(fromSequenceNumber)
      this.eventStoreClient.readHighestSequenceNr(request, (error, response) =>
        error ? reject(error) : resolve(response.getToSequenceNr()),
      )
    })
  }

  /**
   * Retrieves the Events for a given aggregate.
   *
   * @param aggregateId The identifier of the aggregate to read events for
   */
  public openAggregateStream(aggregateId: string): Observable<Event> {
    return new Observable((subscriber) => {
      const call = this.eventStoreClient.listAggregateEvents(
        new GetAggregateEventsRequest().setAggregateId(aggregateId),
      )
      call.on('data', (event) => subscriber.next(event))
      call.on('error', (err) => subscriber.error(err))
      call.on('end', () => subscriber.complete())
      return () => call.cancel()
    })
  }

  /**
   * Retrieves the Events from a given tracking token. However, if several
   * GetEventsRequests are sent in the stream only first one will create the
   * tracker, others are used for increasing number of permits or blacklisting.
   */
  public listEvents(options: AxonListEventOptions): Unsubscribable {
    const stream = new AxonListEventStream(
      options,
      this.clientId,
      this.componentName,
      this.logger,
    )
    stream.open(this.eventStoreClient)
    this.openStreams.add(stream)

    const unsubscribe = () => {
      if (this.openStreams.has(stream)) {
        stream.end()
        this.openStreams.delete(stream)
      }
    }

    return { unsubscribe }
  }

  public appendEvent(event: Event): Promise<boolean> {
    return this.appendEvents([event])
  }

  public appendEvents(events: Event[]): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const call = this.eventStoreClient.appendEvent((err, response) =>
        err ? reject(err) : resolve(response.getSuccess()),
      )
      events.forEach((event) => call.write(this.fulfilledEvent(event)))
      call.end()
    })
  }

  /**
   * Retrieves the first token available in event store (typically 0).
   * Returns 0 when no events in store.
   */
  public getFirstToken(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.eventStoreClient.getLastToken(
        new GetFirstTokenRequest(),
        (err, response) => (err ? reject(err) : resolve(response.getToken())),
      )
    })
  }

  /**
   * Retrieves the last committed token in event store.
   * Returns -1 when no events in store.
   */
  public getLastToken(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.eventStoreClient.getLastToken(
        new GetLastTokenRequest(),
        (err, response) => (err ? reject(err) : resolve(response.getToken())),
      )
    })
  }

  /**
   * Retrieves the token of the first token of an event from specified time in event store.
   * Returns -1 when no events in store.
   */
  public getTokenAt(timestamp: number): Promise<number> {
    return new Promise((resolve, reject) => {
      this.eventStoreClient.getLastToken(
        new GetTokenAtRequest().setInstant(timestamp),
        (err, response) => (err ? reject(err) : resolve(response.getToken())),
      )
    })
  }

  /**
   * Schedule the given event for publication at the given time.
   * The returned ScheduleToken can be used to cancel the planned publication.
   *
   * @param scheduleTime  timestamp when to publish the event
   * @param event         the event to publish
   */
  public scheduleEvent(scheduleTime: number, event: Event): Promise<string> {
    return new Promise((resolve, reject) => {
      this.eventSchedulerClient.scheduleEvent(
        new ScheduleEventRequest()
          .setInstant(scheduleTime)
          .setEvent(this.fulfilledEvent(event)),
        (err, response) => (err ? reject(err) : resolve(response.getToken())),
      )
    })
  }

  /**
   * Cancel a scheduled event and schedule another in its place.
   *
   * @param scheduleTime  timestamp when to publish the event
   * @param event         the event to publish
   * @param scheduleToken optional token of scheduled event to cancel
   */
  public rescheduleEvent(
    scheduleTime: number,
    event: Event,
    scheduleToken?: string,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let request = new RescheduleEventRequest()
        .setInstant(scheduleTime)
        .setEvent(this.fulfilledEvent(event))
      if (scheduleToken) {
        request = request.setToken(scheduleToken)
      }
      this.eventSchedulerClient.rescheduleEvent(request, (error, response) =>
        error ? reject(error) : resolve(response.getToken()),
      )
    })
  }

  /**
   * Cancel the publication of a scheduled event.
   * If the events has already been published, this method does nothing.
   *
   * @param scheduleToken token of scheduled event to cancel
   */
  public cancelScheduledEvent(scheduleToken: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.eventSchedulerClient.cancelScheduledEvent(
        new CancelScheduledEventRequest().setToken(scheduleToken),
        (error, response) => {
          if (error) {
            reject(error)
          } else if (!response.getSuccess() && response.getError()) {
            reject(response.getError())
          } else {
            resolve(response.getSuccess())
          }
        },
      )
    })
  }

  // noinspection JSMethodCanBeStatic (for WebStorm)
  private fulfilledEvent(event: Event): Event {
    return event
      .setMessageIdentifier(event.getMessageIdentifier() || uuid())
      .setTimestamp(event.getTimestamp() || Date.now())
  }
}
