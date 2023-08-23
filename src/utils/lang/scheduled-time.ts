/** @deprecated Use AddTimeDelta and timestampAdding() instead. */
export interface ScheduledTime {
  days?: number
  hours?: number
  minutes?: number
  seconds?: number
}

/** @deprecated Use timestampAdding() and AddTimeDelta instead. */
export function calcScheduledTime(scheduledTime: ScheduledTime | number) {
  if (typeof scheduledTime === 'number') {
    return scheduledTime
  } else {
    let time =
      Date.now() + (scheduledTime.seconds ? scheduledTime.seconds * 1000 : 0)
    time += scheduledTime.minutes ? scheduledTime.minutes * 1000 * 60 : 0
    time += scheduledTime.hours ? scheduledTime.hours * 1000 * 60 * 60 : 0
    time += scheduledTime.days ? scheduledTime.days * 1000 * 60 * 60 * 24 : 0

    return time
  }
}
