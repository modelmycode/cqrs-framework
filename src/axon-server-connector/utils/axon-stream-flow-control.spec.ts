import { AxonStreamFlowControl } from './axon-stream-flow-control'

describe('AxonStreamFlowControl', () => {
  let requestNewPermits: jest.Mock
  let flowControl: AxonStreamFlowControl
  beforeEach(() => {
    requestNewPermits = jest.fn()
    flowControl = new AxonStreamFlowControl(
      'test',
      console,
      requestNewPermits,
      5,
      3,
    )
  })

  it('should send init permits', () => {
    flowControl.sendInitPermits()
    expect(requestNewPermits).toHaveBeenCalledWith(5)
  })

  it('should request new permits', () => {
    flowControl.consumePermit()
    flowControl.consumePermit()
    expect(requestNewPermits).toHaveBeenCalledTimes(0)
    flowControl.consumePermit()
    expect(requestNewPermits).toHaveBeenCalledTimes(1)
    flowControl.consumePermit()
    flowControl.consumePermit()
    expect(requestNewPermits).toHaveBeenCalledTimes(1)
    flowControl.consumePermit()
    expect(requestNewPermits).toHaveBeenCalledTimes(2)
  })
})
