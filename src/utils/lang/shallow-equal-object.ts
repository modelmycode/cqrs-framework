// MIT © 2017 azu
const hasOwn = Object.prototype.hasOwnProperty
// Object.is ponyfill
export const is = (x: any, y: any): boolean => {
  if (x === y) {
    return x !== 0 || y !== 0 || 1 / x === 1 / y
  } else {
    return x !== x && y !== y
  }
}
/**
 * Return true, if `objectA` is shallow equal to `objectB`.
 * Pass Custom equality function to `customEqual`.
 * Default equality is `Object.is`
 *
 * Options:
 *
 * - `customEqual`: function should return true if the `a` value is equal to `b` value.
 * - `debug`: enable debug info to console log. This log will be disable in production build
 */
export const shallowEqual = (
  objectA: any,
  objectB: any,
  options?: {
    customEqual?: <T>(a: T, b: T) => boolean
    // debug options available in development build
    debug?: true
    console?: Pick<Console, 'log' | 'group' | 'groupEnd'>
  },
): boolean => {
  if (objectA === objectB) {
    return true
  }
  if (typeof objectA !== 'object' || objectA === null) {
    return false
  }
  if (typeof objectB !== 'object' || objectB === null) {
    return false
  }

  const keysA = Object.keys(objectA)
  const keysB = Object.keys(objectB)

  if (keysA.length !== keysB.length) {
    return false
  }

  const isEqual =
    options && typeof options.customEqual === 'function'
      ? options.customEqual
      : is

  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]
    if (!hasOwn.call(objectB, key) || !isEqual(objectA[key], objectB[key])) {
      return false
    }
  }

  return true
}
