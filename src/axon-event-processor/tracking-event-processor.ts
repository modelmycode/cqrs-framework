import {Type} from '../utils/lang'
import {EventWithToken} from 'axon-server-node-api'
import {BehaviorSubject, Observable} from 'rxjs'
import {distinctUntilChanged} from 'rxjs/operators'
import {Event} from "axon-server-node-api";
import {getAxonMetadataValue} from '../application/axon-metadata'
import {deserializeObject} from '../application/axon-serialization'
import {EventHandler} from '../application/event-handler'
import {executeAxonHandler} from '../application/execute-axon-handler'
import {AxonConnectionEventChannel} from '../axon-server-connector/channels/axon-connection-event-channel'
import {EventMetadata} from '../event-sourcing/aggregate-event-sourcing'
import {getEventHandlersInType} from '../event-sourcing/event-handler.decorator'
import {logger} from '../logging/logger'
import {EventProcessor} from './event-processor'
import {TrackingTokenStore} from './tracking-token-store'
import {EventProcessorActiveState} from './utils/event-processor-active-state'
import {EventProcessorClaimUtils} from './utils/event-processor-claim-utils'
import {EventProcessorIdleState} from './utils/event-processor-idle-state'

type ServiceLocator = <T>(type: Type<T>) => T | null

export type OverrideProcess = (name: string, aggregateId: string, payload: any) => void
let nextProcessorId = 1

export class TrackingEventProcessor implements EventProcessor {
  //
  private readonly logger = logger.forContext('EventProcessor')
  private readonly isActiveSubject = new BehaviorSubject(false)
  public readonly isActive$: Observable<boolean> = this.isActiveSubject
    .asObservable()
    .pipe(distinctUntilChanged())
  //
  private readonly processorId = nextProcessorId++
  private readonly tokenId: string
  private readonly utils = new EventProcessorClaimUtils(this.clientId)

  private handlerTypesByEvent = new Map<string,
    Array<{ type: Type; method: string }>>()

  private idleState: EventProcessorIdleState | null = null
  private activeState: EventProcessorActiveState | null = null

  public async start() {
    this.logger.log(`Starting ${this.name}#${this.processorId}`)
    try {
      await this.activeState?.deactivate()
      await this.startIdleState()
    } catch (error) {
      this.logger.error(error, true)
      await this.shutdown()
    }
  }


  constructor(
    readonly name: string,
    readonly clientId: string,
    readonly componentName: string = 'default',
    readonly eventChannel: AxonConnectionEventChannel,
    readonly trackingTokenStore: TrackingTokenStore,
    readonly serviceLocator: ServiceLocator,
    handlers: Type[],
    private readonly queueHandlers?: boolean | undefined,
    private readonly replayHistory?: boolean | undefined,
    private overrideProcess?: OverrideProcess
  ) {
    this.tokenId = TrackingTokenStore.generateTokenId(
      this.componentName,
      this.name,
    )
    this.registerHandlers(handlers)
  }

  /** gracefully shutdown the processor */
  public shutdown = async () => {
    this.isActiveSubject.next(false)
    this.logger.log(`Stopping [${this.name}#${this.processorId}]`)
    try {
      await this.idleState?.deactivate()
      await this.activeState?.deactivate()
    } catch (e) {
      this.logger.error(e)
    }
    this.logger.log(`Stopped [${this.name}#${this.processorId}]`)
  }


  private async activateProcessing(startToken: number) {
    this.logger.log(`Activating ${this.name}#${this.processorId}`)
    await this.idleState?.deactivate()
    await this.startActiveState(startToken)
  }

  private async deactivateProcessing() {
    this.isActiveSubject.next(false)
    this.logger.log(`Deactivating ${this.name}#${this.processorId}`)
    await this.activeState?.deactivate()
    await this.startIdleState()
  }

  private async startIdleState() {
    if (!this.idleState) {
      this.idleState = new EventProcessorIdleState(
        this.tokenId,
        this.logger,
        this.utils,
        this.eventChannel,
        this.trackingTokenStore,
        this.activateProcessing.bind(this),
        this.replayHistory ?? false,
      )
      await this.idleState.activate()
    }
  }

  private async startActiveState(startToken: number) {
    const pe = this.processEventOverride ? this.processEventOverride.bind(this) : this.processEvent.bind(this)
    if (!this.activeState) {
      this.activeState = new EventProcessorActiveState(
        this.tokenId,
        this.logger,
        this.utils,
        this.eventChannel,
        this.trackingTokenStore,
        pe,
        this.deactivateProcessing.bind(this),
      )
    }
    await this.activeState.activate(startToken)
    this.isActiveSubject.next(true)
  }

  private processEventOverride = async (eventWithToken: EventWithToken) => {
    try {
      const event = eventWithToken.getEvent()
      const payload = event?.getPayload()
      if (!event || !payload || !this.overrideProcess) return
      this.overrideProcess(
        payload.getType(),
        event.getAggregateIdentifier(),
        deserializeObject(payload),
      )
    } catch (error) {
      this.logger.error(error)
    }
  }

  private processEvent = async (eventWithToken: EventWithToken) => {
    try {
      const event = eventWithToken.getEvent()
      const payload = event?.getPayload()
      if (!event || !payload) return

      const eventName = payload.getType()
      const handlerTypes = this.handlerTypesByEvent.get(eventName)
      if (!handlerTypes || handlerTypes.length === 0) return

      const process = async (type: Type, method: string) => {
        const handler = this.serviceLocator(type)
        if (!handler) {
          this.logger.error(`Cannot find event handler ${type.name}`, true)
          return
        }

        const eventId = event.getMessageIdentifier()
        return executeAxonHandler(
          `${type.name}.${method}( ${eventName}#${eventId} ) @${this.processorId}`,
          () => {
            const fn = handler[method].bind(handler) as EventHandler<any>
            if (fn.length <= 1) return fn(deserializeObject(payload))

            const metadata = {} as EventMetadata
            const map = event.getMetaDataMap()
            map.forEach((v, key) => (metadata[key] = getAxonMetadataValue(v)))
            return fn(deserializeObject(payload), {
              eventName,
              metadata,
              timestamp: event.getTimestamp(),
              aggregateType: event.getAggregateType(),
            })
          },
          'all',
          this.logger.forContext('EventHandler'),
        ).catch((err) => {
          this.logger.error(`Error in event handler ${type.name}.${method}()`, {
            err,
            report: true,
          })
        })
      }
      if (this.queueHandlers) {
        for (const {type, method} of handlerTypes) {
          await process(type, method)
        }
      } else {
        await Promise.all(
          handlerTypes.map(async ({type, method}) => process(type, method)),
        )
      }
    } catch (error) {
      this.logger.error(error)
    }
  }

  private registerHandlers(handlers: Type[]) {
    new Set(handlers).forEach((type) => {
      const entries = Object.entries(getEventHandlersInType(type))
      entries.forEach(([eventName, method]) =>
        this.handlerTypesByEvent.set(eventName, [
          ...(this.handlerTypesByEvent.get(eventName) || []),
          {type, method},
        ]),
      )
    })
    this.logger.log('Subscribe events')
  }
}
