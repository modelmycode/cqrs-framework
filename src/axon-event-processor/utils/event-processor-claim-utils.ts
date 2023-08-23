export class EventProcessorClaimUtils {
  /** Time interval to update heartbeat in store */
  public readonly heartbeatInterval = 10_000
  /** Consider not alive after aliveDuration since last heartbeat */
  public readonly aliveDuration = this.heartbeatInterval * 4

  constructor(private readonly clientId: string) {}

  public nextClaimClientId(): string {
    return this.clientId + '-' + Date.now() // To change updatedAt for heartbeat
  }

  public checkClientId(value: string): boolean {
    return value.indexOf(this.clientId) === 0
  }
}
