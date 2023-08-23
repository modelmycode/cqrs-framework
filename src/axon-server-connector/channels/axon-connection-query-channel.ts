import { ClientDuplexStream } from '@grpc/grpc-js'
import {
  ClientIdentification,
  ErrorMessage,
  FlowControl,
  QueryComplete,
  QueryProviderInbound,
  QueryProviderOutbound,
  QueryRequest,
  QueryResponse,
  QueryService,
  QuerySubscription,
} from 'axon-server-node-api'
import { Observable, Unsubscribable } from 'rxjs'
import { v4 as uuid } from 'uuid'

import { AxonServerConnectorLogger } from '../axon-server-connector-logger'
import {
  AxonServiceClientInit,
  createQueryServiceClient,
} from '../axon-service-clients'
import { AxonStreamFlowControl } from '../utils/axon-stream-flow-control'

type QueryHandler = (query: QueryRequest) => Observable<QueryResponse>

type QueryStream = ClientDuplexStream<
  QueryProviderOutbound,
  QueryProviderInbound
>

export class AxonConnectionQueryChannel {
  private readonly clientId: string
  private readonly componentName: string
  private queryServiceClient: QueryService
  private queryHandlersByName = new Map<string, QueryHandler>()
  private stream: QueryStream | null = null
  private isDisconnected = false

  constructor(
    serviceClientInit: AxonServiceClientInit,
    clientIdentification: ClientIdentification,
    private readonly context: string,
    private readonly logger: AxonServerConnectorLogger,
  ) {
    this.clientId = clientIdentification.getClientId()
    this.componentName = clientIdentification.getComponentName()
    this.queryServiceClient = createQueryServiceClient(serviceClientInit)
  }

  public connect(): void {
    if (this.queryHandlersByName.size > 0) {
      this.openQueryStream()
    }
  }

  public reconnect(serviceClientInit: AxonServiceClientInit): void {
    this.disconnect()

    this.isDisconnected = false // Connecting again
    this.queryServiceClient = createQueryServiceClient(serviceClientInit)
    this.connect()
  }

  public disconnect(): void {
    if (this.stream) {
      this.queryHandlersByName.forEach((_, queryName) =>
        this.sendQueryUnsubscription(queryName),
      )
      this.stream.end()
      this.stream = null
    }
    if (!this.isDisconnected) {
      this.queryServiceClient.close()
      this.isDisconnected = true
    }
  }

  public query(query: QueryRequest): Observable<QueryResponse> {
    return new Observable((subscriber) => {
      const call = this.queryServiceClient.query(this.fulfilledQuery(query))
      call.on('data', (response: QueryResponse) => {
        if (response.hasErrorMessage()) {
          subscriber.error(response)
        } else {
          subscriber.next(response)
        }
      })
      call.on('error', (err) => subscriber.error(err))
      call.on('end', () => subscriber.complete())
      return () => call.cancel()
    })
  }

  public registerQueryHandler(
    queryName: string,
    handler: QueryHandler,
  ): Unsubscribable {
    this.queryHandlersByName.set(queryName, handler)

    if (this.stream) {
      this.sendQuerySubscription(queryName)
    } else {
      this.openQueryStream()
    }

    const unsubscribe = () => {
      if (handler === this.queryHandlersByName.get(queryName)) {
        this.queryHandlersByName.delete(queryName)
        this.sendQueryUnsubscription(queryName)
      }
    }
    return { unsubscribe }
  }

  private sendQuerySubscription(queryName: string) {
    if (!this.stream) return

    const message = new QuerySubscription()
      .setMessageId(uuid())
      .setQuery(queryName)
      .setClientId(this.clientId)
      .setComponentName(this.componentName)
    this.stream.write(new QueryProviderOutbound().setSubscribe(message))
  }

  private sendQueryUnsubscription(queryName: string) {
    if (!this.stream) return

    const message = new QuerySubscription()
      .setMessageId(uuid())
      .setQuery(queryName)
      .setClientId(this.clientId)
      .setComponentName(this.componentName)
    this.stream.write(new QueryProviderOutbound().setUnsubscribe(message))
  }

  private fulfilledQuery(query: QueryRequest): QueryRequest {
    return query
      .setMessageIdentifier(query.getMessageIdentifier() || uuid())
      .setTimestamp(query.getTimestamp() || Date.now())
      .setClientId(query.getClientId() || this.clientId)
      .setComponentName(query.getComponentName() || this.componentName)
  }

  private openQueryStream() {
    const stream = this.queryServiceClient.openStream()
    this.stream = stream

    const flowControl = new AxonStreamFlowControl(
      'query',
      this.logger,
      (permits) => this.sendFlowControlPermits(permits),
    )

    stream.on('data', (data) =>
      this.handleInboundMessage(data).finally(() =>
        flowControl.consumePermit(),
      ),
    )
    stream.on('error', (error) => {
      this.logger.error(`Subscription query stream error - ${error.message}`)
    })
    stream.on('end', () => {
      this.logger.log(`Subscription query stream end`)
      if (this.stream === stream) {
        this.stream = null
      }
    })

    flowControl.sendInitPermits()
    this.queryHandlersByName.forEach((_, queryName) =>
      this.sendQuerySubscription(queryName),
    )
  }

  private sendFlowControlPermits(permits: number) {
    const flowControl = new FlowControl()
      .setClientId(this.clientId)
      .setPermits(permits)
    this.stream?.write(new QueryProviderOutbound().setFlowControl(flowControl))
  }

  private async handleInboundMessage(message: QueryProviderInbound) {
    const requestCase = message.getRequestCase()
    if (requestCase === QueryProviderInbound.RequestCase.ACK) {
      await this.handleInboundAct(message)
    } else if (requestCase === QueryProviderInbound.RequestCase.QUERY) {
      await this.handleInboundQuery(message)
    }
  }

  private async handleInboundAct(message: QueryProviderInbound) {
    this.logger.log(`Query stream Act - ${message.toString()}`)
    // TODO handler inbound act
  }

  private async handleInboundQuery(message: QueryProviderInbound) {
    const query = message.getQuery()
    const payload = query?.getPayload()
    if (!query || !payload) return // Invalid query TODO sendNack

    const queryName = query.getQuery()
    const handler = this.queryHandlersByName.get(queryName)
    if (!handler) return // No handler for this query TODO sendNack

    const requestId = query.getMessageIdentifier()
    const sendResponse = (response: QueryResponse) => {
      response.setRequestIdentifier(requestId)
      if (!response.getMessageIdentifier()) {
        response.setMessageIdentifier(uuid())
      }
      this.stream?.write(new QueryProviderOutbound().setQueryResponse(response))
    }
    const sendComplete = () => {
      const message = new QueryComplete()
        .setMessageId(uuid())
        .setRequestId(requestId)
      this.stream?.write(new QueryProviderOutbound().setQueryComplete(message))
    }
    const sendError = (error: any) => {
      const code = error.code || ''
      const message = error.message || ''
      const location = error.stack || ''
      sendResponse(
        new QueryResponse()
          .setErrorCode(code)
          .setErrorMessage(
            new ErrorMessage()
              .setErrorCode(code)
              .setMessage(message)
              .setLocation(location),
          ),
      )
      sendComplete()
    }
    handler(query).subscribe(sendResponse, sendError, sendComplete)
  }
}
