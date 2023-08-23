import { ClientDuplexStream } from '@grpc/grpc-js'
import {
  ClientIdentification,
  ErrorMessage,
  Heartbeat,
  InstructionAck,
  InstructionResult,
  PlatformInboundInstruction,
  PlatformInfo,
  PlatformOutboundInstruction,
} from 'axon-server-node-api'
import { v4 as uuid } from 'uuid'

import { AxonServerConnectorLogger } from '../axon-server-connector-logger'
import {
  AxonServiceClientInit,
  createPlatformServiceClient,
} from '../axon-service-clients'
import { AxonHeartbeatMonitor } from '../utils/axon-heartbeat-monitor'
import { AxonInstructionMap } from '../utils/axon-instruction-map'

type PlatformStream = ClientDuplexStream<
  PlatformInboundInstruction,
  PlatformOutboundInstruction
>

export class AxonConnectionControlChannel {
  private currentServiceClientInit = this.defaultServiceClientInit
  private currentPlatformServiceClient = createPlatformServiceClient(
    this.defaultServiceClientInit,
  )

  private readonly instructionMap = new AxonInstructionMap()
  private readonly heartbeatMonitor = new AxonHeartbeatMonitor(
    (onAct) => this.sendHeartbeat(onAct),
    () => this.forceReconnect(),
  )

  private stream: PlatformStream | null = null
  private state:
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'disconnecting'
    | 'disconnected'
    | 'error' = 'idle'

  constructor(
    private defaultServiceClientInit: AxonServiceClientInit,
    private clientIdentification: ClientIdentification,
    private requestReconnect: (force: boolean) => void,
    private readonly context: string,
    private readonly logger: AxonServerConnectorLogger,
    /** Temporary workaround of dns name resolution error on local cluster */
    private readonly forceStayOnSameConnection = false,
  ) {}

  public get serviceClientInit(): AxonServiceClientInit {
    return this.currentServiceClientInit
  }

  public async connect(): Promise<void> {
    this.state = 'connecting'
    try {
      await this.checkPlatformInfo()
    } catch (e) {
      this.state = 'error'
      throw e
    }
    this.openPlatformServiceStream()
    this.heartbeatMonitor.start()
    this.state = 'connected'
  }

  public async reconnect(): Promise<void> {
    if (this.state === 'connected') {
      this.disconnect()
    }
    this.currentServiceClientInit = this.defaultServiceClientInit
    this.currentPlatformServiceClient = createPlatformServiceClient(
      this.defaultServiceClientInit,
    )
    await this.connect()
  }

  public disconnect(): void {
    if (this.state !== 'connected') return

    this.state = 'disconnecting'
    this.heartbeatMonitor.stop()
    if (this.stream) {
      this.stream.end()
      this.stream = null
    }
    this.currentPlatformServiceClient.close()
    this.state = 'disconnected'
  }

  private async checkPlatformInfo(): Promise<void> {
    this.logger.log(`Connecting to ${this.defaultServiceClientInit.address}`)
    await new Promise<void>((resolve, reject) =>
      this.currentPlatformServiceClient.waitForReady(
        Date.now() + 10_000,
        (error) => (error ? reject(error) : resolve()),
      ),
    )

    const info = await new Promise<PlatformInfo>((resolve, reject) =>
      this.currentPlatformServiceClient.getPlatformServer(
        this.clientIdentification,
        (error, response) => (error ? reject(error) : resolve(response)),
      ),
    )
    this.logger.log(`Connected to ${this.defaultServiceClientInit.address}`)

    if (this.forceStayOnSameConnection) return

    const primary = info.getPrimary()
    if (!primary) {
      this.logger.error('PlatformInfo: missing redirected primary node')
      return
    }

    this.currentPlatformServiceClient.close()
    this.currentServiceClientInit = {
      ...this.defaultServiceClientInit,
      address: `${primary.getHostName()}:${primary.getGrpcPort()}`,
    }
    this.logger.log(
      `Axon PlatformInfo: Redirected ${this.defaultServiceClientInit.address} -> ${this.currentServiceClientInit.address}`,
    )
    this.currentPlatformServiceClient = createPlatformServiceClient(
      this.currentServiceClientInit,
    )
  }

  private openPlatformServiceStream() {
    this.stream = this.currentPlatformServiceClient.openStream()

    this.stream.on('data', (data: PlatformOutboundInstruction) => {
      if (data.hasAck()) {
        this.instructionMap.onAct(data.getAck())
        return
      }

      if (data.hasHeartbeat()) {
        this.onIncomingHeartbeat()
        return
      }

      this.logger.log(
        `Platform instruction: ${JSON.stringify(data.toObject())}`,
      )
      if (data.hasRequestReconnect()) {
        this.sendAct(data.getInstructionId())
        this.forceReconnect()
      } else {
        this.onUnsupportedInstruction(data)
      }
    })
    this.stream.on('error', (error) => {
      this.logger.error(`Platform stream error - ${error.message}`)
    })
    this.stream.on('end', () => {
      this.logger.log(`Platform stream end`)
      if (this.state === 'connected') {
        this.state = 'error'
        this.stream = null
        this.currentPlatformServiceClient.close()
        this.requestReconnect(false)
      }
    })

    this.stream.write(
      new PlatformInboundInstruction().setRegister(this.clientIdentification),
    )
  }

  private sendAct(instructionId: string | undefined) {
    if (!instructionId || !this.stream) return

    const act = new InstructionAck()
      .setSuccess(true)
      .setInstructionId(instructionId)
    this.stream.write(new PlatformInboundInstruction().setAck(act))
  }

  private onUnsupportedInstruction(data: PlatformOutboundInstruction) {
    this.logger.warn(
      `Unsupported platform instruction ${JSON.stringify(data.toObject())}`,
    )
    const error = new ErrorMessage()
      .setErrorCode('AXONIQ-1002')
      .setMessage('No handler for instruction')
    const act = new InstructionResult()
      .setSuccess(false)
      .setError(error)
      .setInstructionId(data.getInstructionId())
    this.stream?.write(new PlatformInboundInstruction().setAck(act))
  }

  private onIncomingHeartbeat() {
    this.heartbeatMonitor.onIncomingHeartbeat()
    this.stream?.write(
      new PlatformInboundInstruction().setHeartbeat(new Heartbeat()),
    )
  }

  private sendHeartbeat(onAct: (act: InstructionAck) => void) {
    if (!this.stream) return

    const instructionId = uuid()
    this.instructionMap.add(instructionId, onAct)
    this.stream.write(
      new PlatformInboundInstruction()
        .setInstructionId(instructionId)
        .setHeartbeat(new Heartbeat()),
    )
  }

  private forceReconnect() {
    this.disconnect()
    this.requestReconnect(true)
  }
}
