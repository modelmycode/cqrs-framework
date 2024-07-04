import {
  TestPartial,
  isTestPartial,
  validateTestPartial,
} from './testing-utils'
import {Type} from "../lang";
import {AggregateRoot} from "../../event-sourcing/aggregate-root";
import {clearBuildMessage} from "../../api/message/message-utils";
import {Event} from "../../api/message/event.interface";
import {AggregateEventSourcing} from "../../event-sourcing/aggregate-event-sourcing";

export class AggregateSpec<T extends AggregateRoot> {
  private history: Event[] = []
  private command!: (aggregate: T) => Promise<void> | void

  constructor(private readonly aggregateType: Type<T>) {}

  public given(events: Event[]): this {
    this.history = events
    return this
  }

  public when(command: (aggregate: T) => Promise<void> | void): this {
    this.command = command
    return this
  }

  public async then(
    expected:
      | Event
      | Type<Event>
      | ((event: Event) => void)
      | TestPartial
      | Array<Event | Type<Event> | ((event: Event) => void) | TestPartial>,
  ): Promise<void> {
    const events = await this.execute()
    const tests = Array.isArray(expected) ? expected : [expected]

    const count = events.length
    expect(`${count} events`).toBe(`${tests.length} events`)

    const isTestFunction = (fn: any): fn is (e: Event) => void =>
      !/^[A-Z]\w+$/.test(fn.name)

    for (let i = 0; i < count; i++) {
      const test = tests[i]
      if (typeof test === 'function') {
        if (isTestFunction(test)) {
          test(events[i])
        } else {
          expect(events[i].constructor?.name).toBe(test.name)
        }
      } else if (isTestPartial(test)) {
        validateTestPartial(test, events[i])
      } else {
        expect(clearBuildMessage(events[i])).toEqual(test)
      }
    }
  }

  public async error<T = Error>(
    expected: T | ((error: T) => void) | RegExp,
  ): Promise<void> {
    try {
      await this.execute()
    } catch (e) {
      if (typeof expected === 'function') {
        const test = expected as (error: T) => void
        test(e)
      } else if (expected instanceof RegExp) {
        expect(e.message).toMatch(expected)
      } else {
        expect(expected).toEqual(e)
      }
      return
    }

    throw new Error(`Expected to throw but didn't`)
  }

  private async execute(): Promise<Event[]> {
    let events: Event[] = []
    const eventSourcing = new AggregateEventSourcing({
      load: async () =>
        this.history.map((event) => ({
          payload: event,
          name: event.constructor.name,
          timestamp: Date.now(),
        })),
      publish: async (v) => {
        events = v.map((m) => m.event.payload)
      },
    })
    if (this.history.length === 0) {
      await eventSourcing.create(this.aggregateType, '', this.command)
    } else {
      await eventSourcing.load(this.aggregateType, '', this.command)
    }
    return events
  }
}