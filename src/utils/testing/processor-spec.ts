/* eslint-disable @typescript-eslint/no-explicit-any */

import { clearBuildMessage } from '../../api/message/message-utils'
import {Event} from "../../api/message/event.interface";
import {Command} from "../../api/message/command.interface";
import {
  TestPartial,
  isTestPartial,
  validateTestPartial,
} from './testing-utils'
import {AutomationItem, Processor, ProcessStatus} from "../../automation/automation-factory";
import {automationFactory, messageBus} from "../../framework-services";
import {Type} from "../lang";
import {getEventHandlersInType} from "../../event-sourcing/event-handler.decorator";

export class ProcessorSpec<TData, TProcessor extends Processor<TData>> {
  private processor!: TProcessor
  private history: Event[] = []
  private newEvent!: Event

  private todo = new Map<string, AutomationItem<TData>>()
  private commandSpy: jest.SpyInstance

  constructor(private readonly processorType: Type<TProcessor>) {
    jest.spyOn(automationFactory, 'forProcessor').mockImplementation(
      (
        _,
        {
          deleteWhenComplete = true,
          autoRetry = true,
          autoRetryTimes = 3,
          deleteWhenAutoRetryFailed = false,
        }: {
          deleteWhenComplete?: boolean
          autoRetry?: boolean
          autoRetryTimes?: number
          deleteWhenAutoRetryFailed?: boolean
        } = {},
      ) => ({
        add: async (id, data: TData) => {
          this.todo.set(id, { data } as any)
          await this.processor.process(data, {} as any)
        },
        find: async (id) => this.todo.get(id) || null,
        update: async (id, data) => {
          const item = this.todo.get(id)
          if (!item) return
          if (typeof data === 'function') {
            item.data = data(item.data)
          } else {
            // @ts-ignore
            Object.assign(item.data, data)
          }
          await this.processor.process(item.data, item)
        },
        onComplete: async (id) => {
          const item = this.todo.get(id)
          if (!item) return
          item.isComplete = true
          item.completedAt = new Date()
          if (deleteWhenComplete) {
            this.todo.delete(id)
            return
          }
          await this.processor.process(item.data, item)
        },
        onFailed: async (id, data) => {
          const item = this.todo.get(id)
          if (!item) return
          item.failedTimes = (item.failedTimes || 0) + 1
          item.lastFailedAt = new Date()
          if (data) {
            if (typeof data === 'function') {
              item.data = data(item.data)
            } else {
              // @ts-ignore
              Object.assign(item.data, data)
            }
          }

          if (!autoRetry) return
          if (item.failedTimes <= autoRetryTimes) {
            await this.processor.process(item.data, item)
          } else if (deleteWhenAutoRetryFailed) {
            this.todo.delete(id)
          }
        },
        delete: async (id) => {
          this.todo.delete(id)
        },
        tryLater: jest.fn(),
      }),
    )
    this.commandSpy = jest.spyOn(messageBus, 'execute').mockResolvedValue()
  }

  public given(events: Event[]): this {
    this.history = events
    return this
  }

  public when(newEvent: Event): this {
    this.newEvent = newEvent
    return this
  }

  public async then(
    expected:
      | Command
      | Type<Command>
      | ((command: Command) => void)
      | TestPartial
      | 'noCommand',
    processStatus?:
      | 'taskDeleted'
      | Partial<ProcessStatus>
      | { data: TData | ((data: TData) => void) }
      | ((status: ProcessStatus | null) => void),
  ): Promise<void> {
    await this.execute()
    this.validateCommand(expected)
    if (processStatus) {
      this.validateViewStatus(processStatus)
    }
  }

  private validateCommand(
    expected:
      | Command
      | Type<Command>
      | ((command: Command) => void)
      | TestPartial
      | 'noCommand',
  ) {
    const commandCall = this.commandSpy.mock.calls[0]
    if (expected === 'noCommand') {
      if (commandCall) {
        expect(commandCall[0].constructor.name).toBe('no command dispatched')
      }
      return
    }

    if (!commandCall) {
      expect('0 command dispatched').toBe('1 command dispatched')
      return
    }

    if (typeof expected !== 'function') {
      if (isTestPartial(expected)) {
        validateTestPartial(expected, commandCall[0])
      } else {
        expect(clearBuildMessage(commandCall[0])).toEqual(
          clearBuildMessage(expected),
        )
      }
      return
    }

    const isTestFunction = (fn: any): fn is (e: Event) => void =>
      !/^[A-Z]\w+$/.test(fn.name)
    const command = commandCall[0]
    if (isTestFunction(expected)) {
      expected(command)
    } else {
      expect(command.constructor.name).toBe(expected.name)
    }
  }

  private async execute(): Promise<void> {
    this.processor = new this.processorType()

    // Given
    const handlerThis = this.processor as any
    const handlers = getEventHandlersInType(this.processorType)
    this.history.forEach((event) => {
      const eventName = event.constructor.name
      const method = handlers[eventName]
      handlerThis[method](event)
    })

    // When
    this.commandSpy.mockReset()
    handlerThis[handlers[this.newEvent.constructor.name]](this.newEvent)
  }

  private validateViewStatus(
    expected:
      | 'taskDeleted'
      | Partial<ProcessStatus>
      | { data: TData | ((data: TData) => void) }
      | ((status: ProcessStatus | null) => void),
  ) {
    if (expected === 'taskDeleted') {
      if (this.todo.size > 0) {
        expect(`${this.todo.size} tasks left`).toBe('task deleted')
      }
      return
    }

    const defaults: ProcessStatus = {
      isComplete: false,
      completedAt: null,
      failedTimes: 0,
      lastFailedAt: null,
    }
    // noinspection LoopStatementThatDoesntLoopJS
    function pick(object: any, keys: any[]) {
      return keys.reduce((obj, key) => {
        if (object && object.hasOwnProperty(key)) {
          obj[key] = object[key];
        }
        return obj;
      }, {});
    }

    for (const task of this.todo.values()) {
      if (typeof expected === 'function') {
        expected({ ...defaults, ...task })
      } else if ('data' in expected) {
        if (typeof expected.data === 'function') {
          const testData = expected.data as (data: TData) => void
          testData(task.data)
        } else {
          // @ts-ignore
          const keys = Object.keys(expected.data)
          expect(pick(task.data, keys)).toEqual(pick(expected.data, keys))
        }
      } else {
        const status = {} as any
        for (const key of Object.keys(expected) as Array<keyof ProcessStatus>) {
          status[key] = key in task ? task[key] : defaults[key]
        }
        expect(status).toEqual(expected)
      }
      return
    }
    if (typeof expected === 'function') {
      expected(null)
    } else {
      expect(null).toEqual(expected)
    }
  }
}