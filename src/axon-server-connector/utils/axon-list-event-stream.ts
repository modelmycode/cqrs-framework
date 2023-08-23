import { ClientDuplexStream } from '@grpc/grpc-js'
import {
  EventStore,
  EventWithToken,
  GetEventsRequest,
} from 'axon-server-node-api'

import { AxonServerConnectorLogger } from '../axon-server-connector-logger'
import { AxonStreamFlowControl } from './axon-stream-flow-control'

export type AxonListEventOptions = {
  /**
   * The token to start streaming after.
   * Given 10, stream will start from 11.
   * Default -1 if not specified, stream will start from 0.
   */
  trackingToken?: number
  next: (event: EventWithToken) => Promise<void>
  error?: (error: any) => void
  permits?: number
  refillBatch?: number
}

export class AxonListEventStream {
  private currentTrackingToken = this.options.trackingToken ?? -1
  private stream: ClientDuplexStream<GetEventsRequest, EventWithToken> | null =
    null

  constructor(
    private readonly options: AxonListEventOptions,
    private readonly clientId: string,
    private readonly componentName: string,
    private readonly logger: AxonServerConnectorLogger,
  ) {}

  public open(eventStore: EventStore): void {
    this.end()

    const stream = eventStore.listEvents()
    this.stream = stream

    const flowControl = new AxonStreamFlowControl(
      'listEvents',
      this.logger,
      (permits) =>
        stream.write(
          new GetEventsRequest()
            .setNumberOfPermits(permits)
            .setClientId(this.clientId)
            .setComponentName(this.componentName),
        ),
      this.options.permits,
      this.options.refillBatch,
    )

    stream.on('data', (data: EventWithToken) => {
      this.currentTrackingToken = data.getToken()
      this.options.next(data).finally(() => flowControl.consumePermit())
    })
    stream.on('error', (error) => {
      this.logger.error(`List event stream error - ${error.message}`)
      this.options.error?.(error)
    })
    stream.on('end', () => {
      this.logger.log(`List event stream end`)
      if (this.stream === stream) {
        this.stream = null
      }
    })

    stream.write(
      new GetEventsRequest()
        .setTrackingToken(this.currentTrackingToken + 1)
        .setNumberOfPermits(flowControl.permits)
        .setClientId(this.clientId)
        .setComponentName(this.componentName),
    )

    this.logger.log(`List event stream open from ${this.currentTrackingToken}`)
  }

  public end(): void {
    if (this.stream) {
      this.stream.end()
      this.stream = null
    }
  }
}
