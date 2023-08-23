import { InstructionAck } from 'axon-server-node-api'

export class AxonHeartbeatMonitor {
  private deadline = 0

  constructor(
    private readonly send: (onAct: (act: InstructionAck) => void) => void,
    private readonly reconnect: () => void,
    /** the interval at which heartbeat messages are expected */
    private readonly interval = 1_000,
    /** the maximum time to wait after the last successful heartbeat */
    private readonly timeout = 3_000,
  ) {}

  private isRunning = false
  private heartbeatTimeoutId: any
  private deadlineTimeoutId: any

  public start(): void {
    if (this.isRunning) return
    this.isRunning = true

    this.resetDeadline()
    this.scheduleHeartbeat()
  }

  public stop(): void {
    if (!this.isRunning) return
    this.isRunning = false

    this.cancelHeartbeat()
    this.cancelDeadlineCheck()
  }

  public onIncomingHeartbeat(): void {
    this.cancelHeartbeat()
    this.resetDeadline()
    this.scheduleHeartbeat()
  }

  private sendHeartbeat() {
    if (!this.isRunning) return

    this.send((act) => {
      if (!this.isRunning) return

      if (
        act.getSuccess() ||
        act.getError()?.getErrorCode() === 'AXONIQ-1002' // Server error means alive
      ) {
        this.resetDeadline()
      }
      this.scheduleHeartbeat()
    })
  }

  private scheduleHeartbeat() {
    const timeoutId = setTimeout(() => {
      if (this.heartbeatTimeoutId === timeoutId) {
        this.heartbeatTimeoutId = null
        this.sendHeartbeat()
      }
    }, this.interval)
    this.heartbeatTimeoutId = timeoutId
  }

  private cancelHeartbeat() {
    if (this.heartbeatTimeoutId) {
      clearTimeout(this.heartbeatTimeoutId)
      this.heartbeatTimeoutId = null
    }
  }

  private cancelDeadlineCheck() {
    if (this.deadlineTimeoutId) {
      clearTimeout(this.deadlineTimeoutId)
      this.deadlineTimeoutId = null
    }
  }

  private resetDeadline() {
    this.deadline = Date.now() + this.timeout
    const timeoutId = setTimeout(() => {
      if (this.deadlineTimeoutId === timeoutId) {
        this.deadlineTimeoutId = null
        this.onDeadlineMissed()
      }
    }, this.timeout)
    this.deadlineTimeoutId = timeoutId
  }

  private onDeadlineMissed() {
    if (this.isRunning) {
      this.stop()
      this.reconnect()
    }
  }
}
