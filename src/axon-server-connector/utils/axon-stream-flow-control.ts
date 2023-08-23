import { AxonServerConnectorLogger } from '../axon-server-connector-logger'

const defaultFlowPermits = 64
const defaultRefillBatch = 16

/** A utility class for managing axon server stream flow control. */
export class AxonStreamFlowControl {
  /** The current consumed permits count. Will reset to 0 after request new permits. */
  private permitsConsumed = 0

  /** Stats for logging */
  private stats = { consumed: 0, sent: this.permits }

  /**
   * Constructs a AxonStreamFlowControl
   *
   * @param streamName        name of the stream (for logging)
   * @param logger
   * @param requestNewPermits method to request new permits
   * @param permits           the number of permits this stream should receive
   * @param refillBatch       the number of permits to be consumed prior to requesting new permits
   */
  constructor(
    private readonly streamName: string,
    private readonly logger: AxonServerConnectorLogger,
    private readonly requestNewPermits: (permits: number) => void,
    public readonly permits: number = defaultFlowPermits,
    private readonly refillBatch: number = defaultRefillBatch,
  ) {}

  /** Send initial permits (if necessary) */
  public sendInitPermits(): void {
    this.requestNewPermits(this.permits)
    this.logger.log(`Sent ${this.permits} permits to ${this.streamName} stream`)
  }

  /** Consume 1 permit and ask for new permits if refillBatch has been reached. */
  public consumePermit(): void {
    this.stats.consumed++
    if (++this.permitsConsumed < this.refillBatch) {
      return
    }

    this.permitsConsumed = 0
    this.requestNewPermits(this.refillBatch)

    this.stats.sent += this.refillBatch
    this.logger.log(
      `Sent ${this.refillBatch} permits to ${this.streamName} stream (${this.stats.consumed} / ${this.stats.sent})`,
    )
  }
}
