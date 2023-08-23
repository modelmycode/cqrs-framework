import { errorCode } from './error-code'

describe('errorCode()', () => {
  it('should use client as default error side', () => {
    expect(errorCode('testError', 'error')).toBe('testError:client.error')
  })

  it('should add Error to ns', () => {
    expect(errorCode('test', 'error', 'server')).toBe('testError:server.error')
  })
})
