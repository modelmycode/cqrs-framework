import { executeAxonHandler, handlerTimeoutCode } from './execute-axon-handler'

describe('executeAxonHandler()', () => {
  it('should success before timeout', (done) => {
    jest.useFakeTimers()
    executeAxonHandler(
      'test',
      () => new Promise((resolve) => setTimeout(resolve, 1000)),
    ).then(() => done())
    jest.advanceTimersToNextTimer()
  })

  it('should timeout', (done) => {
    jest.useFakeTimers()
    executeAxonHandler(
      'test',
      () => new Promise((resolve) => setTimeout(resolve, 1000_000)),
    ).catch((error) => {
      expect(error.code).toBe(handlerTimeoutCode)
      done()
    })
    jest.advanceTimersToNextTimer()
  })
})
