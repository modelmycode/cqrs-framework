export function isPromise(value: any): value is PromiseLike<any> {
  return typeof (value as any)?.then === 'function'
}
