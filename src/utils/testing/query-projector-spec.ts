import {Event} from "../../api/message/event.interface";
import { Type } from '../lang'
import {QueryDatabaseModel} from "../../query-projector/query-database-model";
import {getEventHandlersInType} from "../../event-sourcing/event-handler.decorator";

export class QueryProjectorSpec<TData> {
  private currentData!: Partial<TData>
  private newEvent!: Event
  private newData: Partial<TData> | null = null

  constructor(
    private readonly projectorType: Type,
    databaseModel: QueryDatabaseModel<TData>,
  ) {
    // jest
    //   .spyOn(databaseModel, 'find')
    //   .mockResolvedValue(this.currentData as TData)
    jest.spyOn(databaseModel, 'create').mockImplementation(async (_, v) => {
      this.newData = v
    })
    jest.spyOn(databaseModel, 'patch').mockImplementation(async (_, v) => {
      this.newData = { ...this.currentData, ...v }
    })
    jest
      .spyOn(databaseModel, 'increase')
      .mockImplementation(async (_, k, i = 1) => {
        this.newData = {
          ...this.currentData,
          [k]: Number(this.currentData[k] || 0) + i,
        }
      })
    jest.spyOn(databaseModel, 'delete').mockImplementation(async () => {
      this.newData = null
    })
  }

  public given(currentData: Partial<TData>): this {
    this.currentData = currentData
    return this
  }

  public when(newEvent: Event): this {
    this.newEvent = newEvent
    return this
  }

  public async then(
    expected: Partial<TData> | ((data: Partial<TData> | null) => void),
  ) {
    const projector = new this.projectorType()
    const handlers = getEventHandlersInType(this.projectorType)
    const eventName = this.newEvent.constructor.name
    const method = handlers[eventName]
    await projector[method](this.newEvent)
    if (typeof expected === 'function') {
      expected(this.newData)
    } else {
      expect(this.newData).toEqual(expected)
    }
  }
}