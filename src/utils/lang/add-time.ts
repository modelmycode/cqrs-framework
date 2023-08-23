export interface AddTimeDelta {
  days?: number
  hours?: number
  minutes?: number
  seconds?: number
  milliseconds?: number
}

/**
 * Calculate a new timestamp by adding a delta time.
 *
 * @param delta Time delta to add to the timestamp. In milliseconds or AddTimeDelta.
 * @param toTime  The timestamp to add time on.
 */
export function timestampAdding(
  delta: AddTimeDelta | number,
  toTime = Date.now(),
): number {
  if (typeof delta === 'number') {
    return toTime + delta
  }
  const days = delta.days || 0
  const hours = (delta.hours || 0) + days * 24
  const minutes = (delta.minutes || 0) + hours * 60
  const seconds = (delta.seconds || 0) + minutes * 60
  const milliseconds = (delta.milliseconds || 0) + seconds * 1000
  return toTime + milliseconds
}

/**
 * Calculate a new Date by adding a delta time.
 *
 * @param delta Time delta to add to the Date. In milliseconds or AddTimeDelta.
 * @param toDate  The Date to add time on.
 */
export function dateAdding(
  delta: AddTimeDelta | number,
  toDate = new Date(),
): Date {
  return new Date(timestampAdding(delta, toDate.valueOf()))
}
