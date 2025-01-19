import {Pool, QueryConfig, QueryConfigValues, QueryResultRow} from 'pg'

import { logger } from '../logging/logger'

export interface PostgresConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  logging?: boolean
}

export class PostgresDb {
  private readonly logger = logger.forContext(PostgresDb)
  private logging?: boolean
  private pool: Pool | null = null

  public async connect(connection: PostgresConfig) {
    if (this.pool) throw new Error('Postgres db is already connected')

    this.pool = new Pool(connection)
    this.logging = connection.logging
  }

  public async query<R extends QueryResultRow = any, I extends any[] = any[]>(
    textOrConfig: string | QueryConfig<I>,
    values?: QueryConfigValues<I>,
    logging: boolean = true,
  ): Promise<R[]> {
    if (!this.pool) throw new Error('Postgres db is not connected')

    if (this.logging && logging) {
      const text =
        typeof textOrConfig === 'string' ? textOrConfig : textOrConfig.text
      this.logger.log(`Executing: ${text} values:${values}`)
    }
    const result = await this.pool.query(textOrConfig, values)
    return result.rows
  }

  public async disconnect() {
    if (this.pool) {
      await this.pool.end()
    }
    this.pool = null
  }
}