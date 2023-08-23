import { Event } from '..'

export interface EventScheduler {
  /**
   * Schedule the given event for publication at the given time.
   * The returned ScheduleToken can be used to cancel the planned publication.
   *
   * @param event The event to publish.
   * @param scheduleTime Timestamp when to publish the event. Use timestampAdding() for relative time.
   * @return ScheduleToken can be used to cancel the planned publication.
   */
  scheduleEvent(event: Event, scheduleTime: number): Promise<string>

  /**
   * Schedule the given event for publication at the given time.
   * The returned ScheduleToken can be used to cancel the planned publication.
   *
   * @param event The event to publish.
   * @param scheduleTime Timestamp when to publish the event. Use timestampAdding() for relative time.
   * @param scheduleToken Optional token of scheduled event to cancel.
   * @return ScheduleToken can be used to cancel the planned publication.
   */
  rescheduleEvent(
    event: Event,
    scheduleTime: number,
    scheduleToken?: string,
  ): Promise<string>

  /**
   * Cancel the publication of a scheduled event.
   * If the events has already been published, this method does nothing.
   *
   * @param scheduleToken Token of scheduled event to cancel.
   * @return true if successfully canceled or false if failed.
   */
  cancelScheduledEvent(scheduleToken: string): Promise<boolean>
}
