import { BackendError } from '../errors/backend-error'
import { fromErrorMessage, toErrorMessage } from './axon-error-message'

describe('toErrorMessage() | fromErrorMessage()', () => {
  it('should convert to Error', () => {
    try {
      // noinspection ExceptionCaughtLocallyJS
      throw new BackendError('foo', 'bar')
    } catch (error) {
      const newError = fromErrorMessage(toErrorMessage(error))
      expect(newError.code).toEqual('foo')
      expect(newError.message).toEqual('bar')
      expect(newError.stack).toEqual(error.stack)
    }
  })

  it('should pass i18n', () => {
    expect(
      fromErrorMessage(toErrorMessage(new BackendError('', ''))).i18n,
    ).toBeUndefined()
    expect(
      fromErrorMessage(toErrorMessage(new BackendError('', '', false))).i18n,
    ).toBe(false)
    expect(
      fromErrorMessage(toErrorMessage(new BackendError('', '', true))).i18n,
    ).toBe(true)
    expect(
      fromErrorMessage(toErrorMessage(new BackendError('', '', { count: 1 })))
        .i18n,
    ).toEqual({ count: 1 })
  })

  it('should pass data', () => {
    expect(
      fromErrorMessage(
        toErrorMessage(new BackendError('', '', true, { test: 10 })),
      ).data,
    ).toEqual({ test: 10 })
  })
})
