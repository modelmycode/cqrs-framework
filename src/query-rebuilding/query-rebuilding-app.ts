import {Type} from '../utils/lang'

import { AxonServerConnectionFactory } from '../axon-server-connector/axon-server-connection-factory'
import { AxonServerConnectionOptions } from '../axon-server-connector/axon-server-context-connection'
import { PostgresConfig } from '../database/postgres-db'
import { postgresDb } from '../framework-services'
import { logger } from '../logging/logger'
import { QueryDatabaseModel } from '../query-projector/query-database-model'
import { QueryRebuildGroup } from './query-rebuild-group'

interface QueryRebuildingConfig {
  connection: AxonServerConnectionOptions

  rebuildGroups: Array<{
    rebuildId: string
    projectors: Type[]
    databaseModels: QueryDatabaseModel[]
  }>

  database: {
    postgres?: PostgresConfig
  }
}

export class QueryRebuildingApp {
  private readonly logger = logger.forContext(QueryRebuildingApp)

  private readonly rebuildGroups: QueryRebuildGroup[] = []
  private readonly connectionFactory = new AxonServerConnectionFactory(
    this.config.connection,
    this.logger,
  )

  constructor(private readonly config: QueryRebuildingConfig) {}

  public async connect(): Promise<void> {
    const { rebuildGroups, database } = this.config
    if (rebuildGroups.length === 0) {
      this.logger.log('No rebuild queries found')
      return
    }

    if (database.postgres) {
      await postgresDb.connect(database.postgres)
    }

    let projectors: Type[] = []
    let databaseModels: QueryDatabaseModel[] = []
    for (const config of rebuildGroups) {
      if (!config.rebuildId) throw new Error('Invalid rebuildId')

      const group = new QueryRebuildGroup(
        config.rebuildId,
        config.projectors,
        config.databaseModels,
      )
      await group.prepare()

      this.rebuildGroups.push(group)
      projectors = projectors.concat(config.projectors)
      databaseModels = databaseModels.concat(config.databaseModels)
    }
    if (new Set(projectors).size !== projectors.length) {
      throw new Error('Duplicated projectors in groups')
    }
    if (new Set(databaseModels).size !== databaseModels.length) {
      throw new Error('Duplicated database models in groups')
    }

    const { eventChannel } = await this.connectionFactory.connect(
      this.config.connection.context || 'default',
    )
    for (const group of this.rebuildGroups) {
      await group.start(eventChannel)
    }
  }

  public async shutdown(): Promise<void> {
    this.rebuildGroups.forEach((v) => v.shutdown())
    this.connectionFactory.shutdown()
  }
}
