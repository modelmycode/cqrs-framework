import {Event} from '..'

import {
  AggregateConcurrencyError,
  AggregateEventSourcing,
} from './aggregate-event-sourcing'
import {AggregateRoot} from './aggregate-root'
import {eventSourcingHandler} from './event-sourcing-handler.decorator'

describe('AggregateEventSourcing', () => {
  class CounterStartedEvent implements Event {
    constructor(public readonly value: number) {
    }
  }

  class CounterIncreasedEvent implements Event {
    constructor(public readonly delta: number) {
    }
  }

  class CounterDecreasedEvent implements Event {
    constructor(public readonly delta: number) {
    }
  }

  class Counter extends AggregateRoot {
    value = 0 // public for testing, aggregate properties should be private
    start(value: number) {
      this.apply(new CounterStartedEvent(value))
    }

    increase(delta: number) {
      this.apply(new CounterIncreasedEvent(delta))
    }

    decrease(delta: number) {
      if (delta > this.value) {
        throw new Error(`Cannot decrease ${delta} from ${this.value}`)
      }
      this.apply(new CounterDecreasedEvent(delta))
    }

    @eventSourcingHandler()
    onStarted(event: CounterStartedEvent) {
      this.value = event.value
    }

    @eventSourcingHandler()
    onIncreased(event: CounterIncreasedEvent) {
      this.value += event.delta
    }

    @eventSourcingHandler()
    onDecreased(event: CounterDecreasedEvent) {
      this.value -= event.delta
    }
  }

  let load: jest.Mock
  let publish: jest.Mock
  let eventSourcing: AggregateEventSourcing
  beforeEach(() => {
    load = jest.fn()
    publish = jest.fn()
    eventSourcing = new AggregateEventSourcing({load, publish})
  })

  describe('create', () => {
    it('should create the aggregate and execute command', async () => {
      await eventSourcing.create(Counter, '1', (aggregate) => {
        aggregate.start(10)
        expect(aggregate.value).toBe(10)
      })
      expect(load).not.toHaveBeenCalled()

      expect(publish).toHaveBeenCalled()
      const publishedEvents = publish.mock.calls[0][0]
      expect(publishedEvents[0].aggregateIdentifier).toBe('1')
      expect(publishedEvents[0].aggregateType).toBe(Counter.name)
      expect(publishedEvents[0].sequenceNumber).toBe(0)
      expect(publishedEvents[0].event.name).toBe(CounterStartedEvent.name)
      expect(publishedEvents[0].event.payload).toEqual(
        new CounterStartedEvent(10),
      )
    })
  })

  describe('load', () => {
    beforeEach(() =>
      load.mockResolvedValue([
        {
          name: CounterStartedEvent.name,
          payload: {value: 10} as CounterStartedEvent,
        },
        {
          name: CounterIncreasedEvent.name,
          payload: {delta: 1} as CounterIncreasedEvent,
        },
      ]),
    )

    it('should load the aggregate and execute command', async () => {
      await eventSourcing.load(Counter, '2', (aggregate) => {
        expect(aggregate.value).toBe(11)
        aggregate.increase(1)
        expect(aggregate.value).toBe(12)
        aggregate.decrease(2)
        expect(aggregate.value).toBe(10)
      })

      expect(load).toHaveBeenCalled()

      expect(publish).toHaveBeenCalled()
      const publishedEvents = publish.mock.calls[0][0]
      expect(publishedEvents.length).toBe(2)
      expect(publishedEvents[0].aggregateIdentifier).toBe('2')
      expect(publishedEvents[0].aggregateType).toBe(Counter.name)
      expect(publishedEvents[0].sequenceNumber).toBe(2)
      expect(publishedEvents[0].event.name).toBe(CounterIncreasedEvent.name)
      expect(publishedEvents[0].event.payload).toEqual(
        new CounterIncreasedEvent(1),
      )
      expect(publishedEvents[1].sequenceNumber).toBe(3)
      expect(publishedEvents[1].event.payload).toEqual(
        new CounterDecreasedEvent(2),
      )
    })

    it('should not public events if command failed', async () => {
      const onError = jest.fn()
      await eventSourcing
        .load(Counter, '3', (aggregate) => {
          aggregate.increase(1)
          aggregate.decrease(20)
        })
        .catch(onError)
      expect(onError).toHaveBeenCalled()
      expect(publish).not.toHaveBeenCalled()
    })

    it('should retry on concurrency error', async () => {
      publish.mockImplementation(() =>
        Promise.reject(new AggregateConcurrencyError()),
      )
      const onError = jest.fn()
      await eventSourcing
        .load(Counter, '0', (aggregate) => aggregate.increase(1))
        .catch(onError)
      expect(publish.mock.calls.length).toBe(3)
      expect(publish.mock.calls[2][0][0].sequenceNumber).toBe(2)
      expect(onError.mock.calls[0][0]).toBeInstanceOf(AggregateConcurrencyError)
    })

    it('should trigger side effects only once with guard', async () => {
      publish.mockImplementation(() =>
        Promise.reject(new AggregateConcurrencyError()),
      )

      let numCommand = 0
      const command = (aggregate: Counter) => {
        aggregate.increase(1)
        numCommand++
      }
      let numGuard = 0
      const guard = () => {
        if (++numGuard >= 3) {
          throw new Error(`${numGuard}`)
        }
      }
      const onError = jest.fn()
      await eventSourcing.load(Counter, '0', command, guard).catch(onError)
      expect(numCommand).toBe(1)
      expect(onError).toBeCalledWith(new Error('3'))
      expect(publish.mock.calls.length).toBe(2)
      expect(publish.mock.calls[1][0][0].event.payload).toEqual({delta: 1})
    })
  })
})
