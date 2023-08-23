import { DatabaseModel } from '../database/database-model'
import { postgresDb } from '../framework-services'

export class TrackingTokenStore implements DatabaseModel {
  //
  public static generateTokenId(
    component: string,
    processorName: string,
  ): string {
    return `${component}#${processorName}`
  }

  public async initDatabase() {
    await postgresDb.query(`CREATE TABLE IF NOT EXISTS "event-processors" (\
"id" VARCHAR(255) NOT NULL , \
"clientId" VARCHAR(255), \
"token" INTEGER NOT NULL, \
"data" JSONB, \
"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, \
"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, \
PRIMARY KEY ("id"))`)
  }

  public async read(tokenId: string): Promise<{
    token: { id: string; clientId: string | null; token: number } | null
    updatedAt: Date | null
  }> {
    const result = await postgresDb.query(
      `SELECT "id", "clientId", "token", "updatedAt" \
FROM "event-processors" WHERE "id" = $1`,
      [tokenId],
      false,
    )
    const { id, clientId, token, updatedAt } = result?.[0] || {}
    return { token: id ? { id, clientId, token } : null, updatedAt }
  }

  public async create(tokenId: string, clientId: string, token: number) {
    await postgresDb.query(
      `INSERT INTO "event-processors" \
("id","clientId","token","data","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6)`,
      [tokenId, clientId, token, null, new Date(), new Date()],
    )
  }

  public async setClientId(tokenId: string, clientId: string | null) {
    await postgresDb.query(
      `UPDATE "event-processors" SET "clientId"=$1,"updatedAt"=$2 WHERE "id" = $3`,
      [clientId, new Date(), tokenId],
      false,
    )
  }

  public async setToken(id: string, token: number) {
    await postgresDb.query(
      `UPDATE "event-processors" SET "token"=$1,"updatedAt"=$2 WHERE "id" = $3`,
      [token, new Date(), id],
    )
  }
}
