export interface EventProcessor {
  /**
   * The name of this event processor. This name is used to detect distributed instances of the
   * same event processor. Multiple instances referring to the same logical event processor (on different JVM's)
   * must have the same name.
   */
  name: string

  /**
   * Start processing events.
   */
  start: () => void

  /**
   * Stops processing events. Blocks until the shutdown is complete.
   */
  shutdown: () => Promise<void>
}
