import { DatabaseModel } from '../database/database-model'
import { postgresDb } from '../framework-services'

export class QueryDatabaseModel<TData = unknown> implements DatabaseModel {
  constructor(public readonly tableName: string) {
  }

  public async initDatabase() {
    await postgresDb.query(`CREATE TABLE IF NOT EXISTS "${this.tableName}"
    (
        "id" UUID NOT NULL,
        "data" JSONB NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY ("id")
        )`)
  }

  public async create(id: string, data: TData): Promise<void> {
    await postgresDb.query(
      `INSERT INTO "${this.tableName}"
           ("id", "data", "createdAt", "updatedAt","deletedAt")
       VALUES ($1, $2, $3, $4, $5)`,
      [id, data, new Date(), new Date(), null],
    )
  }

  /** Find one item by its id */
  public async find(id: string): Promise<TData | null>
  /** Find many items by their ids */
  public async find(ids: string[]): Promise<TData[] | null>
  public async find(
    idOrList: string | string[],
  ): Promise<TData | TData[] | null> {
    const findOne = typeof idOrList === 'string'
    const result = await postgresDb.query(
      `SELECT "data"
       FROM "${this.tableName}"
       WHERE "deletedAt" IS NULL AND "id" = ${findOne ? '$1' : 'ANY ($1::uuid[])'}`,
      [idOrList],
    )
    const data = result?.map((item) => item.data)
    return findOne ? data?.[0] : data
  }

  /**
   * Find an item by one (top level or nested) field in data
   *
   * @param field The top level field name, or the path for the nested field
   * @param value Value to match at the field name path.
   *
   * @example findByField('trialId', 'abc') - { trialId: 'abc' }
   * @example findByField(['trial', 'id'], 'abc') - { trial: { id: 'abc' } }
   */
  public async findByField(
    field: keyof TData | [keyof TData, ...string[]],
    value: string | string[],
  ): Promise<TData | null>
  public async findByField(
    field: keyof TData | [keyof TData, ...string[]],
    value: string | string[],
    findAll: 'findAll',
  ): Promise<TData[] | null>
  public async findByField(
    field: keyof TData | [keyof TData, ...string[]],
    value: string | string[],
    findAll?: 'findAll',
  ): Promise<TData | TData[] | null> {
    const singleValue = typeof value === 'string'
    const path = (Array.isArray(field) ? field : [field]).join(',')
    const result = await postgresDb.query(
      `SELECT "data"
       FROM "${this.tableName}"
       WHERE "deletedAt" IS NULL
       AND data #>> '{${path}}' = ${singleValue ? '$1' : 'ANY ($1)'}`,
      [value as string],
    )
    const data = result?.map((item) => item.data)
    return findAll ? data : data?.[0]
  }

  public async findAllByField(
    field: keyof TData | [keyof TData, ...string[]],
    value: string | string[],
  ): Promise<TData[] | null> {
    return this.findByField(field, value, 'findAll')
  }

  /** Patch data of an item */
  public async patch(id: string, data: Partial<TData>) {
    await postgresDb.query(
      `UPDATE "${this.tableName}"
       SET "data"      = data || '${JSON.stringify(data)}',
           "updatedAt" = $1
       WHERE "id" = $2`,
      [new Date(), id],
    )
  }

  /**
   * Patch one (top level or nested) field in data of an item
   *
   * @param field       The top level field name, or the path for the nested field
   * @param data        Field data for patching
   * @param findValue   Value on the field to find the item
   * @param findKey     The key of findValue to find the item. Default to 'id'
   *
   * @example queryDb.patchField('trial', newTrialData, trialId)
   * @example queryDb.patchField(['trial', 'person'], { name }, email, 'email')
   */
  public async patchField(
    field: keyof TData | [keyof TData, ...string[]],
    data: any,
    findValue: string,
    findKey = 'id',
  ) {
    const fieldPath = Array.isArray(field) ? field : [field]
    const findPath = [...fieldPath, findKey]

    const setPath = `'{${fieldPath.join(',')}}'`
    const setValue = `data #> ${setPath} || '${JSON.stringify(data)}'`

    await postgresDb.query(
      `UPDATE "${this.tableName}"
       SET "data"      = jsonb_set(data, ${setPath}, ${setValue}),
           "updatedAt" = $1
       WHERE data #>> '{${findPath.join(',')}}' = $2`,
      [new Date(), findValue],
    )
  }

  public async increase(id: string, key: keyof TData, delta = 1) {
    await postgresDb.query(
      `UPDATE "${this.tableName}"
       SET "data"=jsonb_set(data, '{${String(key)}}',
                            (COALESCE(data ->> '${String(key)}', '0')::int + ${delta})::text::jsonb),
           "updatedAt"=$1
       WHERE "id" = $2`,
      [new Date(), id],
    )
  }

  public async delete(id: string): Promise<void> {
    await postgresDb.query(
      `UPDATE "${this.tableName}"
       SET "deletedAt"=$1
       WHERE "id" = $2`,
      [new Date(), id],
    )
  }

  public async raw(query: string): Promise<TData[] | null> {
    const result = await postgresDb.query(query)
    return result.map((record) => record.data) || null
  }

  public async insertArray(id: string, key: keyof TData, newData: any) {
    await postgresDb.query(
      `UPDATE "${this.tableName}"
       SET "data"     = jsonb_insert(data::jsonb, '{${String(key)}, 0}', '${JSON.stringify(
               newData,
       )}'::jsonb, true),
           "updatedAt"=$1
       WHERE "id" = $2`,
      [new Date(), id],
    )
  }
}
