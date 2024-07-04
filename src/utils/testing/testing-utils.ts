import { Type } from '../lang'

export type TestPartial<T = unknown> = { __testPartial__: Type<T> } & Partial<T>

export function testPartial<T>(
  type: Type<T>,
  values: Partial<T>,
  defaults?: Partial<T>,
): TestPartial<T> {
  return { ...defaults, ...values, __testPartial__: type, constructor: type }
}

export function isTestPartial<T>(v: any): v is TestPartial<T> {
  return '__testPartial__' in v
}

export function validateTestPartial<T>(test: TestPartial<T>, actual: T) {
  expect((actual as any).constructor?.name).toBe(test.__testPartial__.name)
  const keys = Object.keys(test).filter( (item) =>  item !=='__testPartial__' && item !== 'constructor')
  expect(pick(actual, keys)).toEqual(pick(test, keys))
}

export function testStub<T>(
  type: Type<T>,
  values: Partial<T>,
  defaults?: Partial<T>,
): T {
  return testPartial(type, values, defaults) as unknown as T
}

function pick(object: any, keys: any[]) {
  return keys.reduce((obj, key) => {
    if (object && object.hasOwnProperty(key)) {
      obj[key] = object[key];
    }
    return obj;
  }, {});
}