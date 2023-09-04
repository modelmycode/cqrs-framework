import { EventWithToken } from 'axon-server-node-api'
import { Unsubscribable } from 'rxjs'

import { AxonConnectionEventChannel } from '../../axon-server-connector/channels/axon-connection-event-channel'
import { Logger } from '../../logging/logger'
import { EventBuffer } from '../event-buffer'
import { TrackingTokenStore } from '../tracking-token-store'
import { EventProcessorClaimUtils } from './event-processor-claim-utils'

/** A state where the event process is processing events. */
export class EventProcessorActiveState {
  private isActive = false

  private eventStream: Unsubscribable | undefined
  private eventBuffer = new EventBuffer()

  private keepAliveTimeout: any
  private processLoopTimeout: any

  private lastSavedClientId?: string

  constructor(
    private readonly tokenId: string,
    private readonly logger: Logger,
    private readonly utils: EventProcessorClaimUtils,
    private readonly eventChannel: AxonConnectionEventChannel,
    private readonly trackingTokenStore: TrackingTokenStore,
    private readonly processEvent: (v: EventWithToken) => Promise<void>,
    private readonly onStateChange: () => void,
  ) {}

  public async activate(startToken: number): Promise<void> {
    if (this.isActive) return
    this.isActive = true

    this.startEventStream(startToken)
    this.scheduleKeepAlive()
    await this.startProcessingLoop()
  }

  public async deactivate(): Promise<void> {
    if (!this.isActive) return
    this.isActive = false

    this.cancelKeepAlive()
    this.cancelProcessSchedule()
    await Promise.all([
      this.closeEvenStream().catch((e) => this.logger.error(e)),
      this.releaseTokenClaim().catch((e) => this.logger.error(e)),
    ])
  }

  private startEventStream(fromToken: number) {

    this.eventStream = this.eventChannel.listEvents({
      trackingToken: fromToken,
      next: (v) => this.eventBuffer.add(v),
    })
  }

  private async closeEvenStream() {
    const stream = this.eventStream
    this.eventStream = undefined
    await stream?.unsubscribe()
  }

  private scheduleKeepAlive() {
    this.cancelKeepAlive()

    const timeoutId = setTimeout(() => {
      if (this.keepAliveTimeout === timeoutId) {
        this.keepAliveTimeout = null
        this.keepAlive()
      }
    }, this.utils.heartbeatInterval)

    this.keepAliveTimeout = timeoutId
  }

  private cancelKeepAlive() {
    if (this.keepAliveTimeout) {
      clearTimeout(this.keepAliveTimeout)
      this.keepAliveTimeout = null
    }
  }

  private keepAlive() {
    if (!this.isActive) return

    this.trackingTokenStore.read(this.tokenId).then(
      ({ token }) => {
        if (!this.isActive) return

        this.validateSavedClientId(token?.clientId)
        if (!token?.clientId || this.utils.checkClientId(token.clientId)) {
          const clientId = this.utils.nextClaimClientId()
          this.trackingTokenStore.setClientId(this.tokenId, clientId).then(
            () => (this.lastSavedClientId = clientId),
            (e) => this.logger.error(e),
          )
          this.scheduleKeepAlive()
        } else {
          this.logger.warn(`Taken over by ${token.clientId}`)
          this.onStateChange()
        }
      },
      (e) => {
        this.logger.error(e)
        if (this.isActive) {
          this.scheduleKeepAlive()
        }
      },
    )
  }

  private async startProcessingLoop() {
    this.cancelProcessSchedule()
    await this.processingLoop()
  }

  private scheduleProcessingCheck() {
    this.cancelProcessSchedule()
    const timeoutId = setTimeout(async () => {
      if (this.processLoopTimeout === timeoutId) {
        this.processLoopTimeout = null
        await this.processingLoop()
      }
    }, 3_000)
    this.processLoopTimeout = timeoutId
  }

  private cancelProcessSchedule() {
    if (this.processLoopTimeout) {
      clearTimeout(this.processLoopTimeout)
      this.processLoopTimeout = null
    }
  }

  private async processingLoop() {
    if (!this.isActive) return

    if (this.eventBuffer.isEmpty()) {
      this.scheduleProcessingCheck()
      return
    }

    const trackedEventMessage = this.eventBuffer.peek()
    if (trackedEventMessage) {
      try {
        await this.processEvent(trackedEventMessage.event)
      } catch (error) {
        this.logger.error(error.message)
      }
      this.eventBuffer.dequeue()

      try {
        await this.markEventProcessed(trackedEventMessage.event.getToken())
        trackedEventMessage.ack()
      } catch {
        this.onStateChange()
        return
      }
    }

    if (this.isActive) {
      await this.processingLoop()
    }
  }

  private async markEventProcessed(token: number, failedTimes = 0) {
    if (!this.isActive) return

    try {
      await this.trackingTokenStore.setToken(this.tokenId, token)
    } catch (e) {
      if (failedTimes >= 3) {
        throw e
      }
      failedTimes++
      await new Promise((resolve) => setTimeout(resolve, failedTimes * 1000))
      await this.markEventProcessed(token, failedTimes)
    }
  }

  private async releaseTokenClaim() {
    const { token } = await this.trackingTokenStore.read(this.tokenId)
    if (token?.clientId && this.utils.checkClientId(token.clientId)) {
      this.lastSavedClientId = undefined
      await this.trackingTokenStore.setClientId(this.tokenId, null)
    }
  }

  private validateSavedClientId(storeId: string | null | undefined) {
    if (this.lastSavedClientId && this.lastSavedClientId !== storeId) {
      this.logger.error(
        `Last saved ${this.lastSavedClientId}, in store ${storeId}`,
      )
    }
  }
}
