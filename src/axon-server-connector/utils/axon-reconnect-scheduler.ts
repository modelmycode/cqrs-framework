import { AxonServerConnectorLogger } from '../axon-server-connector-logger'

export class AxonReconnectScheduler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private timeoutHandle: any | null = null // any - TS is confused with number or NodeJS.Timeout from setTimeout()

  constructor(
    private readonly reconnect: () => Promise<void>,
    private readonly logger: AxonServerConnectorLogger,
    private readonly interval = 2_000,
  ) {}

  public schedule(): void {
    this.logger.log('Reconnected schedule requested')
    if (this.timeoutHandle === null) {
      this.timeoutHandle = setTimeout(() => this.tryReconnect(), this.interval)
      this.logger.log(
        `Reconnected scheduled [${this.timeoutHandle}] in ${this.interval}ms`,
      )
    }
  }

  public cancel(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle)
      this.timeoutHandle = null
    }
  }

  public reconnectNow() {
    this.cancel()

    this.timeoutHandle = 0 // to bypass the cancel check (timeoutHandle = null)
    this.tryReconnect()
  }

  private tryReconnect() {
    this.logger.log(`Trying reconnect [${this.timeoutHandle}]`)
    if (this.timeoutHandle === null) return

    this.reconnect().then(
      () => (this.timeoutHandle = null),
      (error) => {
        this.logger.error(
          `Reconnect [${this.timeoutHandle}] failed - ${error.message}`,
        )
        if (this.timeoutHandle !== null) {
          this.timeoutHandle = null
          this.schedule()
        }
      },
    )
  }
}
