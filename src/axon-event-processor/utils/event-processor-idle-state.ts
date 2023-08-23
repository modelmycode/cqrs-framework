import { AxonConnectionEventChannel } from '../../axon-server-connector/channels/axon-connection-event-channel'
import { Logger } from '../../logging/logger'
import { TrackingTokenStore } from '../tracking-token-store'
import { EventProcessorClaimUtils } from './event-processor-claim-utils'

/** A state where the event process is not processing events. */
export class EventProcessorIdleState {
  private isActive = false
  private checkScheduleTimeout: any

  constructor(
    private readonly tokenId: string,
    private readonly logger: Logger,
    private readonly utils: EventProcessorClaimUtils,
    private readonly eventChannel: AxonConnectionEventChannel,
    private readonly trackingTokenStore: TrackingTokenStore,
    private readonly onStateChange: (startToken: number) => void,
    private readonly replayHistory: boolean,
  ) {}

  public async activate(): Promise<void> {
    if (this.isActive) return
    this.isActive = true
    this.scheduleClaimCheck(true)
  }

  public async deactivate(): Promise<void> {
    if (!this.isActive) return
    this.isActive = false
    this.cancelClaimCheckSchedule()
  }

  private scheduleClaimCheck(now = false) {
    this.cancelClaimCheckSchedule()
    if (!this.isActive) return

    if (now) {
      this.check().catch((e) => this.logger.error(e))
      return
    }

    const timeoutId = setTimeout(() => {
      if (this.checkScheduleTimeout === timeoutId) {
        this.checkScheduleTimeout = null
        this.check().catch((e) => this.logger.error(e))
      }
    }, 30_000)
    this.checkScheduleTimeout = timeoutId
  }

  private cancelClaimCheckSchedule() {
    if (this.checkScheduleTimeout) {
      clearTimeout(this.checkScheduleTimeout)
      this.checkScheduleTimeout = null
    }
  }

  private async check(): Promise<void> {
    if (!this.isActive) return

    try {
      const { token: storeRecord, updatedAt: ts } =
        await this.trackingTokenStore.read(this.tokenId)

      if (!storeRecord?.clientId) {
        this.logger.log('There is no existing token in the store')
        return await this.activateProcessing(
          this.replayHistory ? -1 : await this.eventChannel.getLastToken(),
          true,
        )
      }

      if (this.utils.checkClientId(storeRecord.clientId)) {
        return await this.activateProcessing(storeRecord.token)
      }

      if (ts && Date.now() - ts.valueOf() > this.utils.aliveDuration) {
        this.logger.log(`${storeRecord.clientId} is offline, taking over`)
        return await this.activateProcessing(storeRecord.token)
      }
    } catch (e) {
      this.logger.error(e)
    }

    this.scheduleClaimCheck()
  }

  private async activateProcessing(token: number, create = false) {
    if (!this.isActive) return

    const clientId = this.utils.nextClaimClientId()
    if (create) {
      await this.trackingTokenStore.create(this.tokenId, clientId, token)
    } else {
      await this.trackingTokenStore.setClientId(this.tokenId, clientId)
    }
    this.onStateChange(token)
  }
}
