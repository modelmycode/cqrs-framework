import { Observable } from 'rxjs'

import { DatabaseModel } from '../database/database-model'
import { postgresDb } from '../framework-services'
import { logger } from '../logging/logger'

export interface AutomationItem<TData = unknown> {
  id: string
  processor: string
  data: TData

  isComplete: boolean
  completedAt: Date | null

  failedTimes: number
  lastFailedAt: Date | null
}

export type ProcessStatus = Pick<
  AutomationItem,
  'isComplete' | 'completedAt' | 'failedTimes' | 'lastFailedAt'
>

export interface Processor<TData = unknown> extends Object {
  process(data: TData, state: ProcessStatus): Promise<void>
}

interface ProcessorAutomation<TData> {
  add(id: string, data: TData): Promise<void>
  find(id: string): Promise<AutomationItem<TData> | null>
  update(
    id: string,
    data: Partial<TData> | ((data: TData) => Partial<TData>),
  ): Promise<void>
  onComplete(id: string): Promise<void>
  onFailed(
    id: string,
    data?: Partial<TData> | ((data: TData) => TData),
  ): Promise<void>
  delete(id: string): Promise<void>
  tryLater(id: string): void
}

const dbId = (processor: string, itemId: string) => `${processor}-${itemId}`

export class AutomationFactory implements DatabaseModel {
  private readonly logger = logger.forContext(AutomationFactory)
  private processorLocator!: (typeName: string) => Processor | null
  private isActive = false

  private pendingTasks = new Map<string, AutomationItem>()

  public init(
    processorLocator: (typeName: string) => Processor | null,
    isActive$: Observable<boolean>,
  ) {
    this.processorLocator = processorLocator
    isActive$.subscribe((v) => (v ? this.activate() : this.deactivate()))
  }

  public forProcessor<TData>(
    processor: Processor<TData>,
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
  ): ProcessorAutomation<TData> {
    const tryLater = (itemId: string, delay = 1_000) => {
      setTimeout(async () => {
        const id = dbId(processor.constructor.name, itemId)
        const item = await this.findItem<TData>(id)
        if (!item || item.isComplete) return
        await processor.process(item.data, item)
      }, delay)
    }
    return {
      add: async (itemId, data) => {
        const processorName = processor.constructor.name
        const item: AutomationItem<TData> = {
          id: dbId(processorName, itemId),
          processor: processorName,
          data,
          isComplete: false,
          completedAt: null,
          failedTimes: 0,
          lastFailedAt: null,
        }
        await postgresDb.query(
          `INSERT INTO "automation-items" \
("id","processor","data","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5) \
ON CONFLICT (id) DO UPDATE SET "data" = $3, "updatedAt" = $5`,
          [item.id, item.processor, item.data, new Date(), new Date()],
        )
        await processor.process(item.data, item)
      },

      find: async (itemId) =>
        this.findItem<TData>(dbId(processor.constructor.name, itemId)),

      update: async (itemId, data) => {
        const id = dbId(processor.constructor.name, itemId)
        const item = await this.findItem<TData>(id)
        if (!item) return

        const newData = {
          ...item.data,
          ...(typeof data === 'function' ? data(item.data) : data),
        }
        await postgresDb.query(
          `UPDATE "automation-items" SET "data"=$1,"updatedAt"=$2 WHERE "id" = $3`,
          [newData, new Date(), id],
        )
        await processor.process(newData, item)
      },

      onComplete: async (itemId) => {
        const id = dbId(processor.constructor.name, itemId)
        this.pendingTasks.delete(id)

        const item = await this.findItem<TData>(id)
        if (!item || item.isComplete) return

        if (deleteWhenComplete) {
          await this.deleteItem(id)
          return
        }

        const changes: Partial<AutomationItem> = {
          isComplete: true,
          completedAt: new Date(),
        }
        await this.updateItem(id, changes)

        Object.assign(item, changes)
        await processor.process(item.data, item)
      },

      onFailed: async (itemId, data) => {
        const id = dbId(processor.constructor.name, itemId)
        const item = await this.findItem<TData>(id)
        if (!item || item.isComplete) return

        const changes: Partial<AutomationItem> = {
          failedTimes: item.failedTimes + 1,
          lastFailedAt: new Date(),
        }
        if (data) {
          changes.data =
            typeof data === 'function'
              ? data(item.data)
              : { ...item.data, data }
        }

        await this.updateItem(id, changes)
        Object.assign(item, changes)

        if (!autoRetry) return
        if (item.failedTimes <= autoRetryTimes) {
          tryLater(itemId)
        } else if (deleteWhenAutoRetryFailed) {
          await this.deleteItem(id)
        }
      },

      delete: async (itemId) => {
        const id = dbId(processor.constructor.name, itemId)
        this.pendingTasks.delete(id)
        await this.deleteItem(id)
      },

      tryLater,
    }
  }

  public async initDatabase() {
    await postgresDb.query(`CREATE TABLE IF NOT EXISTS "automation-items" (\
"id" TEXT NOT NULL , \
"processor" TEXT NOT NULL, \
"data" JSONB NOT NULL, \
"isComplete" BOOLEAN NOT NULL DEFAULT false, \
"completedAt" TIMESTAMP WITH TIME ZONE, \
"failedTimes" SMALLINT NOT NULL DEFAULT 0, \
"lastFailedAt" TIMESTAMP WITH TIME ZONE, \
"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, \
"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, \
PRIMARY KEY ("id"));`)
  }

  private async findItem<TData>(id: string) {
    const result = await postgresDb.query(`SELECT \
"id", "processor", "data", "isComplete", "completedAt", "failedTimes", "lastFailedAt" \
FROM "automation-items" WHERE "id" = '${id}'`)
    return result?.[0] as AutomationItem<TData>
  }

  private async updateItem(id: string, changes: Partial<AutomationItem>) {
    const keys = Object.keys(changes)
    const setFields = keys.map((v, i) => `"${v}"=$${i + 1}`).join(',')
    const $updatedAt = `$${keys.length + 1}`
    const $id = `$${keys.length + 2}`
    const values = keys.map((v) => changes[v as keyof AutomationItem])
    await postgresDb.query(
      `UPDATE "automation-items" \
SET ${setFields},"updatedAt"=${$updatedAt} WHERE "id" = ${$id}`,
      [...values, new Date(), id],
    )
  }

  private async deleteItem(id: string) {
    await postgresDb.query(
      `DELETE FROM "automation-items" WHERE "id" = '${id}'`,
    )
  }

  private async activate() {
    this.isActive = true
    try {
      const pendingItems = await postgresDb.query<AutomationItem>(`SELECT \
"id", "processor", "data", "isComplete", "completedAt", "failedTimes", "lastFailedAt" \
FROM "automation-items"`)

      for (const item of pendingItems) {
        this.pendingTasks.set(item.id, item)
        await this.process(item)
      }
    } catch (e) {
      this.logger.error(e, { location: 'activate' })
    }
  }

  private deactivate() {
    this.isActive = false
  }

  private async process(task: AutomationItem) {
    const processor = this.processorLocator(task.processor)
    if (!processor) {
      this.logger.error(
        `Processor ${task.processor} is not registered as event handler`,
        { location: 'process', report: true },
      )
      return
    }
    try {
      await processor.process(task.data, task)
    } catch (e) {
      this.logger.error(e, { location: 'process', report: true })
    }
  }
}
