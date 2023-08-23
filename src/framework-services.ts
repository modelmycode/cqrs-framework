import { MessageBus } from './application/message-bus'
import { AutomationFactory } from './automation/automation-factory'
import { PostgresDb } from './database/postgres-db'

export const messageBus = new MessageBus()

export const automationFactory = new AutomationFactory()

export const postgresDb = new PostgresDb()
