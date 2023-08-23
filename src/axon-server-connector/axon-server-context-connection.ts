import { InterceptingCall, Interceptor, credentials } from '@grpc/grpc-js'
// import { ClientIdentification } from 'axon-server-node-api'

import { AxonServerConnectorLogger } from './axon-server-connector-logger'
import { AxonServiceClientInit } from './axon-service-clients'
import { AxonConnectionCommandChannel } from './channels/axon-connection-command-channel'
import { AxonConnectionControlChannel } from './channels/axon-connection-control-channel'
import { AxonConnectionEventChannel } from './channels/axon-connection-event-channel'
import { AxonConnectionQueryChannel } from './channels/axon-connection-query-channel'
import { AxonReconnectScheduler } from './utils/axon-reconnect-scheduler'
import { ClientIdentification } from "axon-server-node-api";

export { ClientIdentification, credentials }

export interface AxonServerConnectionOptions {
  serviceClientInit: AxonServiceClientInit
  clientIdentification: ClientIdentification
  context?: string
  forceStayOnSameConnection?: boolean
}

export class AxonServerContextConnection {
  private readonly clientIdentification: ClientIdentification
  private readonly channels: {
    control: AxonConnectionControlChannel
    command?: AxonConnectionCommandChannel
    query?: AxonConnectionQueryChannel
    event?: AxonConnectionEventChannel
  }
  private reconnectScheduler = new AxonReconnectScheduler(
    () => this.reconnect(),
    this.logger,
  )
  private connectingPromise: Promise<void> | null = null
  private isConnected = false

  constructor(
    private readonly context: string,
    connectionOptions: AxonServerConnectionOptions,
    private readonly logger: AxonServerConnectorLogger,
  ) {
    this.clientIdentification = connectionOptions.clientIdentification
    this.channels = {
      control: new AxonConnectionControlChannel(
        this.mergeClientInit(connectionOptions.serviceClientInit),
        this.clientIdentification,
        (force) =>
          force ? this.forceReconnect() : this.reconnectScheduler.schedule(),
        this.context,
        this.logger,
        connectionOptions.forceStayOnSameConnection,
      ),
    }
  }

  public get controlChannel(): AxonConnectionControlChannel {
    return this.channels.control
  }

  public get commandChannel(): AxonConnectionCommandChannel {
    if (!this.channels.command) {
      this.channels.command = new AxonConnectionCommandChannel(
        this.channels.control.serviceClientInit,
        this.clientIdentification,
        this.context,
        this.logger,
      )
    }
    return this.channels.command
  }

  public get queryChannel(): AxonConnectionQueryChannel {
    if (!this.channels.query) {
      this.channels.query = new AxonConnectionQueryChannel(
        this.channels.control.serviceClientInit,
        this.clientIdentification,
        this.context,
        this.logger,
      )
    }
    return this.channels.query
  }

  public get eventChannel(): AxonConnectionEventChannel {
    if (!this.channels.event) {
      this.channels.event = new AxonConnectionEventChannel(
        this.channels.control.serviceClientInit,
        this.clientIdentification,
        this.logger,
      )
    }
    return this.channels.event
  }

  public connect(): Promise<void> {
    if (this.isConnected) return Promise.resolve()
    if (this.connectingPromise) return this.connectingPromise

    const promise = this.channels.control.connect().then(() => {
      this.isConnected = true
      this.channels.command?.connect()
      this.channels.query?.connect()
    })
    this.connectingPromise = promise
    promise.finally(() => {
      this.connectingPromise === promise && (this.connectingPromise = null)
    })
    return promise
  }

  public disconnect() {
    this.isConnected = false
    this.reconnectScheduler.cancel()
    this.channels.control.disconnect()
    this.channels.command?.disconnect()
    this.channels.query?.disconnect()
    this.channels.event?.disconnect()
  }

  private mergeClientInit(src: AxonServiceClientInit): AxonServiceClientInit {
    const contextInterceptor: Interceptor = (options, nextCall) =>
      new InterceptingCall(nextCall(options), {
        start: (metadata, listener, next) => {
          metadata.set('AxonIQ-Context', this.context)
          next(metadata, listener)
        },
      })
    const interceptors = [
      ...(src.options?.interceptors || []),
      contextInterceptor,
    ]
    return {...src, options: {...src.options, interceptors}}
  }

  private async reconnect(): Promise<void> {
    await this.channels.control.reconnect()
    const {serviceClientInit} = this.channels.control
    this.channels.command?.reconnect(serviceClientInit)
    this.channels.query?.reconnect(serviceClientInit)
    this.channels.event?.reconnect(serviceClientInit)
  }

  private async forceReconnect() {
    this.channels.control.disconnect()
    this.channels.command?.disconnect()
    this.channels.query?.disconnect()
    this.channels.event?.disconnect()

    this.reconnectScheduler.reconnectNow()
  }
}
