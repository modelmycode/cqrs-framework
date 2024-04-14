import { logger } from '../logging/logger'
import { ConnectionPool } from "mssql";

export interface MsSQLConfig {
  user: string
  password: string
  database: string
  server: string
  pool: {
    max: 10
    min: 0
    idleTimeoutMillis: 30000
  }
  options: {
    encrypt: boolean
    trustServerCertificate: boolean // change to true for local dev / self-signed certs
  }
  logging?: boolean
}

export class MssqlDb {
  private readonly logger = logger.forContext(MssqlDb)
  private logging?: boolean
  private pool: ConnectionPool | null = null
  private poolConnect: ConnectionPool | null = null

  public async connect(connection: MsSQLConfig) {
    if (this.pool) throw new Error('MS SQL db is already connected')

    this.pool = new ConnectionPool(connection)
    this.pool.on('error', (err: string | Error) => this.logger.error(err, true))
    this.poolConnect = await this.pool.connect()
    this.logging = connection.logging
  }

  // run a query
  public async query<R = any>(
    sql: string,
    logging = true,
  ): Promise<R[] | null> {
    if (!this.pool) throw new Error('MS SQL db is not connected')

    if (this.logging && logging) {
      this.logger.log(`Executing: ${sql}`)
    }
    const result = await this.pool.request().query(sql)
    return result.recordset
  }

  public async disconnect() {
    if (this.pool) {
      await this.pool.close()
    }
    this.pool = null
  }
}
