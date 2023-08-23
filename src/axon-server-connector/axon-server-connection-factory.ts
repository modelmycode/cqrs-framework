import { AxonServerConnectorLogger } from './axon-server-connector-logger'
import {
  AxonServerConnectionOptions,
  AxonServerContextConnection,
} from './axon-server-context-connection'

export class AxonServerConnectionFactory {
  private connectionsByContext = new Map<string, AxonServerContextConnection>()
  private isShutdown = false

  constructor(
    private connectionOptions: AxonServerConnectionOptions,
    private logger: AxonServerConnectorLogger = console,
  ) {}

  public async connect(context: string): Promise<AxonServerContextConnection> {
    if (this.isShutdown) {
      throw new Error('Connector is already shut down')
    }

    let connection = this.connectionsByContext.get(context)
    if (!connection) {
      connection = new AxonServerContextConnection(
        context,
        this.connectionOptions,
        this.logger,
      )
      this.connectionsByContext.set(context, connection)
    }
    await connection.connect()

    return connection
  }

  public shutdown(): void {
    this.isShutdown = true
    this.connectionsByContext.forEach((v) => v.disconnect())
  }
}
