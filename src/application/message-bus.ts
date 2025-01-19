import {
  Command,
  CommandReturnType,
  Event,
  Query,
  QueryReturnType,
  RespondingCommand,
} from '../api'
import {
  Command as CommandRequest,
  CommandResponse,
  Event as EventMessage,
  QueryRequest,
  QueryResponse,
} from 'axon-server-node-api'
import {Observable, Unsubscribable, firstValueFrom} from 'rxjs'

import {AxonServerContextConnection} from '../axon-server-connector/axon-server-context-connection'
import {EventScheduler} from '../services/event-scheduler'
import {fromErrorMessage} from './axon-error-message'
import {deserializeObject, serializeObject} from './axon-serialization'
import {encodeCommandHeaders} from './headers/command-headers'
import {encodeQueryHeaders} from './headers/query-headers'

export class MessageBus implements EventScheduler {
  private connection: AxonServerContextConnection | null = null

  constructor() {
    this.query = this.query.bind(this)
    this.execute = this.execute.bind(this)
    this.dispatch = this.dispatch.bind(this)
    this.scheduleEvent = this.scheduleEvent.bind(this)
    this.rescheduleEvent = this.rescheduleEvent.bind(this)
    this.cancelScheduledEvent = this.cancelScheduledEvent.bind(this)
  }

  public async connect(connection: AxonServerContextConnection): Promise<void> {
    this.connection = connection
    await connection.connect()
  }

  /** Dispatch a query message. */
  public async query<T extends Query>(
    query: T,
    headers?: Record<string, any>,
  ): QueryReturnType<T> {
    if (headers) {
      Object.assign(query, encodeQueryHeaders(headers))
    }

    const request = new QueryRequest()
      .setQuery(query.constructor.name)
      .setPayload(serializeObject(query))
    try {
      const response = await firstValueFrom(
        this.validatedConnection().queryChannel.query(request),
      )
      const payload = response.getPayload()
      if (payload) {
        return deserializeObject(payload)
      } else {
        return null
      }
    } catch (e) {
      const errorMessage = (e as QueryResponse)?.getErrorMessage()
      if (errorMessage) {
        throw fromErrorMessage(errorMessage)
      }
      throw e
    }
  }

  /** Dispatch a command message that expects a response body. */
  public execute<T extends RespondingCommand>(
    command: T,
    headers?: Record<string, any>,
  ): CommandReturnType<T>
  /** Dispatch a command message. */
  public execute(command: Command, headers?: Record<string, any>): Promise<void>
  public async execute(command: Command, headers?: Record<string, string>) {
    if (headers) {
      Object.assign(command, encodeCommandHeaders(headers))
    }

    const name = command.constructor.name
    const request = new CommandRequest()
      .setName(name)
      .setPayload(serializeObject(command, name))
    try {
      const response =
        await this.validatedConnection().commandChannel.dispatchCommand(request)
      const payload = response.getPayload()
      if (payload) {
        return deserializeObject(payload)
      }
    } catch (e) {
      const errorMessage = (e as CommandResponse)?.getErrorMessage()
      if (errorMessage) {
        return Promise.reject(fromErrorMessage(errorMessage))
      }
      throw e
    }
  }

  /** Dispatch an event message that does not belong to an aggregate, e.g. external events. */
  public async dispatch(event: Event): Promise<boolean> {
    return this.validatedConnection().eventChannel.appendEvent(
      new EventMessage().setPayload(serializeObject(event)),
    )
  }

  /**
   * Schedule the given event for publication at the given time.
   * The returned ScheduleToken can be used to cancel the planned publication.
   *
   * @param event The event to publish.
   * @param scheduleTime Timestamp when to publish the event. Use timestampAdding() for relative time.
   * @param scheduledToken Optional token of earlier event scheduled so it gets cancelled
   * @return ScheduleToken can be used to cancel the planned publication.
   */
  public async scheduleEvent(
    event: Event,
    scheduleTime: number,
    scheduledToken?: string,
  ): Promise<string> {
    return this.validatedConnection().eventChannel.rescheduleEvent(
      scheduleTime,
      new EventMessage().setPayload(serializeObject(event)),
      scheduledToken,
    )
  }

  /**
   * Schedule the given event for publication at the given time.
   * The returned ScheduleToken can be used to cancel the planned publication.
   *
   * @param event The event to publish.
   * @param scheduleTime Timestamp when to publish the event. Use timestampAdding() for relative time.
   * @param scheduleToken Optional token of scheduled event to cancel.
   * @return ScheduleToken can be used to cancel the planned publication.
   */
  public async rescheduleEvent(
    event: Event,
    scheduleTime: number,
    scheduleToken?: string,
  ): Promise<string> {
    return this.validatedConnection().eventChannel.rescheduleEvent(
      scheduleTime,
      new EventMessage().setPayload(serializeObject(event)),
      scheduleToken,
    )
  }

  /**
   * Cancel the publication of a scheduled event.
   * If the events has already been published, this method does nothing.
   *
   * @param scheduleToken Token of scheduled event to cancel.
   * @return true if successfully canceled or false if failed.
   */
  public async cancelScheduledEvent(scheduleToken: string): Promise<boolean> {
    return this.validatedConnection().eventChannel.cancelScheduledEvent(
      scheduleToken,
    )
  }

  /** Listen to new events */
  public listEvents(
    names: Set<string>,
  ): Observable<{ name: string; event: Event }> {
    const {eventChannel} = this.validatedConnection()
    let unsubscribable: Unsubscribable | undefined
    let isUnsubscribed = false
    return new Observable((subscriber) => {
      eventChannel.getLastToken().then(
        (trackingToken) => {
          if (isUnsubscribed) return

          unsubscribable = eventChannel.listEvents({
            trackingToken,
            next: async (v) => {
              const payload = v.getEvent()?.getPayload()
              if (!payload || !names.has(payload.getType())) return
              subscriber.next({
                name: payload.getType(),
                event: deserializeObject(payload),
              })
            },
            error: (error) => subscriber.error(error),
          })
        },
        (error) => subscriber.error(error),
      )
      return () => {
        isUnsubscribed = true
        unsubscribable?.unsubscribe()
      }
    })
  }

  private validatedConnection(): AxonServerContextConnection {
    if (!this.connection) throw new Error('Message dispatcher not connected')
    return this.connection
  }
}