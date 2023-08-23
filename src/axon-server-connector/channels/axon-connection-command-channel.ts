import { ClientDuplexStream } from '@grpc/grpc-js'
import {
  ClientIdentification,
  Command,
  CommandProviderInbound,
  CommandProviderOutbound,
  CommandResponse,
  CommandService,
  CommandSubscription,
  ErrorMessage,
  FlowControl,
  MetaDataValue,
  ProcessingInstruction,
  ProcessingKey,
} from 'axon-server-node-api'
import { Unsubscribable } from 'rxjs'
import { v4 as uuid } from 'uuid'

import { AxonServerConnectorLogger } from '../axon-server-connector-logger'
import {
  AxonServiceClientInit,
  createCommandServiceClient,
} from '../axon-service-clients'
import { AxonStreamFlowControl } from '../utils/axon-stream-flow-control'

type CommandHandler = (command: Command) => Promise<CommandResponse>

type CommandStream = ClientDuplexStream<
  CommandProviderOutbound,
  CommandProviderInbound
>

export class AxonConnectionCommandChannel {
  private readonly clientId: string
  private readonly componentName: string
  private commandServiceClient: CommandService
  private commandHandlersByName = new Map<string, CommandHandler>()
  private loadFactorsByCommandName = new Map<string, number>()
  private stream: CommandStream | null = null
  private isDisconnected = false

  constructor(
    serviceClientInit: AxonServiceClientInit,
    clientIdentification: ClientIdentification,
    private readonly context: string,
    private readonly logger: AxonServerConnectorLogger,
  ) {
    this.clientId = clientIdentification.getClientId()
    this.componentName = clientIdentification.getComponentName()
    this.commandServiceClient = createCommandServiceClient(serviceClientInit)
  }

  public connect(): void {
    if (this.commandHandlersByName.size > 0) {
      this.openCommandStream()
    }
  }

  public reconnect(serviceClientInit: AxonServiceClientInit): void {
    this.disconnect()

    this.isDisconnected = false // Connecting again
    this.commandServiceClient = createCommandServiceClient(serviceClientInit)
    this.connect()
  }

  public disconnect(): void {
    if (this.stream) {
      this.commandHandlersByName.forEach((_, commandName) =>
        this.sendCommandUnsubscription(commandName),
      )
      this.stream.end()
      this.stream = null
    }
    if (!this.isDisconnected) {
      this.commandServiceClient.close()
      this.isDisconnected = true
    }
  }

  public dispatchCommand(command: Command): Promise<CommandResponse> {
    return new Promise((resolve, reject) =>
      this.commandServiceClient.dispatch(
        this.fulfilledCommand(command),
        (error, response) => {
          if (error) return reject(error)
          if (response.hasErrorMessage()) {
            reject(response)
          } else {
            resolve(response)
          }
        },
      ),
    )
  }

  public registerCommandHandler(
    commandName: string,
    handler: CommandHandler,
    loadFactor: number,
  ): Unsubscribable {
    this.commandHandlersByName.set(commandName, handler)
    this.loadFactorsByCommandName.set(commandName, loadFactor)

    if (this.stream) {
      this.sendCommandSubscription(commandName)
    } else {
      this.openCommandStream()
    }

    const unsubscribe = () => {
      if (handler === this.commandHandlersByName.get(commandName)) {
        this.commandHandlersByName.delete(commandName)
        this.loadFactorsByCommandName.delete(commandName)
        this.sendCommandUnsubscription(commandName)
      }
    }
    return { unsubscribe }
  }

  private sendCommandSubscription(commandName: string) {
    if (!this.stream) return

    const message = new CommandSubscription()
      .setMessageId(uuid())
      .setCommand(commandName)
      .setClientId(this.clientId)
      .setComponentName(this.componentName)
      .setLoadFactor(this.loadFactorsByCommandName.get(commandName) || 0)
    this.stream.write(new CommandProviderOutbound().setSubscribe(message))
  }

  private sendCommandUnsubscription(commandName: string) {
    if (!this.stream) return

    const message = new CommandSubscription()
      .setMessageId(uuid())
      .setCommand(commandName)
      .setClientId(this.clientId)
      .setComponentName(this.componentName)
    this.stream.write(new CommandProviderOutbound().setUnsubscribe(message))
  }

  private fulfilledCommand(command: Command): Command {
    const messageId = command.getMessageIdentifier() || uuid()
    const instructions = command.getProcessingInstructionsList() || []
    if (!instructions.find((v) => v.getKey() === ProcessingKey.ROUTING_KEY)) {
      instructions.push(
        new ProcessingInstruction()
          .setKey(ProcessingKey.ROUTING_KEY)
          .setValue(new MetaDataValue().setTextValue(messageId)),
      )
    }
    return command
      .setMessageIdentifier(messageId)
      .setProcessingInstructionsList(instructions)
      .setTimestamp(command.getTimestamp() || Date.now())
      .setClientId(command.getClientId() || this.clientId)
      .setComponentName(command.getComponentName() || this.componentName)
  }

  private openCommandStream() {
    const stream = this.commandServiceClient.openStream()
    this.stream = stream

    const flowControl = new AxonStreamFlowControl(
      'command',
      this.logger,
      (permits) => this.sendFlowControlPermits(permits),
    )

    stream.on('data', (data) =>
      this.handleInboundMessage(data).finally(() =>
        flowControl.consumePermit(),
      ),
    )
    stream.on('error', (error) => {
      this.logger.error(`Subscription command stream error - ${error.message}`)
    })
    stream.on('end', () => {
      this.logger.log(`Subscription command stream end`)
      if (this.stream === stream) {
        this.stream = null
      }
    })

    flowControl.sendInitPermits()
    this.commandHandlersByName.forEach((_, commandName) =>
      this.sendCommandSubscription(commandName),
    )
  }

  private sendFlowControlPermits(permits: number) {
    const flowControl = new FlowControl()
      .setClientId(this.clientId)
      .setPermits(permits)
    this.stream?.write(
      new CommandProviderOutbound().setFlowControl(flowControl),
    )
  }

  private async handleInboundMessage(message: CommandProviderInbound) {
    const requestCase = message.getRequestCase()
    if (requestCase === CommandProviderInbound.RequestCase.ACK) {
      await this.handleInboundAct(message)
    } else if (requestCase === CommandProviderInbound.RequestCase.COMMAND) {
      await this.handleInboundCommand(message)
    }
  }

  private async handleInboundAct(message: CommandProviderInbound) {
    this.logger.log(`Command stream Act - ${message.toString()}`)
    // TODO handle inbound act
  }

  private async handleInboundCommand(message: CommandProviderInbound) {
    const command = message.getCommand()
    const payload = command?.getPayload()
    if (!command || !payload) return // Invalid command TODO sendNack

    const commandName = command.getName()
    const handler = this.commandHandlersByName.get(commandName)
    if (!handler) return // No handler for this command TODO sendNack

    let response: CommandResponse
    try {
      response = await handler(command)
    } catch (error) {
      if (error instanceof CommandResponse) {
        response = error
      } else {
        const code = error.code || ''
        const message = error.message || ''
        const location = error.stack || ''
        response = new CommandResponse()
          .setErrorCode(code)
          .setErrorMessage(
            new ErrorMessage()
              .setErrorCode(code)
              .setMessage(message)
              .setLocation(location),
          )
      }
    }

    response.setRequestIdentifier(command.getMessageIdentifier())
    if (!response.getMessageIdentifier()) {
      response.setMessageIdentifier(uuid())
    }

    this.stream?.write(
      new CommandProviderOutbound().setCommandResponse(response),
    )
  }
}
