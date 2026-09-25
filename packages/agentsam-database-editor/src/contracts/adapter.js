/**
 * DatabaseAdapter — provider-agnostic contract.
 * UI and CLI never branch on provider strings; they call this interface.
 *
 * @typedef {'sqlite'|'postgres'|'mysql'} DatabaseEngine
 * @typedef {'local'|'cloudflare-d1'|'supabase'|'postgres'|'mysql'} DatabaseProvider
 *
 * @typedef {object} DatabaseCapabilities
 * @property {boolean} schemaIntrospection
 * @property {boolean} sqlQuery
 * @property {boolean} rowMutations
 * @property {boolean} export
 * @property {boolean} transactions
 * @property {boolean} multiStatement
 * @property {'statement'|'batch'|'none'} migrationApply
 *
 * @typedef {object} TableInfo
 * @property {string} name
 * @property {string} [schema]
 * @property {string} [kind]  table|view|materialized_view
 * @property {number} [approxRowCount]
 *
 * @typedef {object} ColumnInfo
 * @property {string} name
 * @property {string} type
 * @property {boolean} [nullable]
 * @property {boolean} [primaryKey]
 * @property {string} [defaultValue]
 *
 * @typedef {object} TableSchema
 * @property {string} name
 * @property {string} [schema]
 * @property {ColumnInfo[]} columns
 * @property {Array<{name:string,columns:string[],unique?:boolean}>} [indexes]
 * @property {Array<{name:string,columns:string[],refTable:string,refColumns:string[]}>} [foreignKeys]
 *
 * @typedef {object} DatabaseSchema
 * @property {string} connectionId
 * @property {DatabaseEngine} engine
 * @property {TableInfo[]} tables
 *
 * @typedef {object} DatabaseQuery
 * @property {string} sql
 * @property {unknown[]} [params]
 * @property {number} [limit]
 * @property {number} [offset]
 * @property {boolean} [readOnly]
 *
 * @typedef {object} QueryResult
 * @property {string[]} columns
 * @property {unknown[][]} rows
 * @property {number} [rowCount]
 * @property {number} [durationMs]
 * @property {boolean} [truncated]
 *
 * @typedef {object} InsertRequest
 * @property {string} table
 * @property {string} [schema]
 * @property {Record<string, unknown>} values
 *
 * @typedef {object} UpdateRequest
 * @property {string} table
 * @property {string} [schema]
 * @property {Record<string, unknown>} values
 * @property {Record<string, unknown>} where
 *
 * @typedef {object} DeleteRequest
 * @property {string} table
 * @property {string} [schema]
 * @property {Record<string, unknown>} where
 *
 * @typedef {object} MutationResult
 * @property {number} changes
 * @property {unknown} [lastInsertId]
 *
 * @typedef {object} DatabaseHealth
 * @property {'ok'|'degraded'|'down'} status
 * @property {string} [detail]
 * @property {Record<string, unknown>} [metrics]
 *
 * @typedef {object} DatabaseAdapter
 * @property {string} id
 * @property {DatabaseEngine} dialect
 * @property {() => DatabaseCapabilities} capabilities
 * @property {() => Promise<DatabaseSchema>} introspect
 * @property {() => Promise<TableInfo[]>} listTables
 * @property {(name: string, opts?: {schema?: string}) => Promise<TableSchema>} describeTable
 * @property {(input: DatabaseQuery) => Promise<QueryResult>} query
 * @property {(input: InsertRequest) => Promise<MutationResult>} [insert]
 * @property {(input: UpdateRequest) => Promise<MutationResult>} [update]
 * @property {(input: DeleteRequest) => Promise<MutationResult>} [delete]
 * @property {() => Promise<DatabaseHealth>} [health]
 * @property {(sql: string) => Promise<{ok:boolean,results:Array<{sql:string,ok:boolean,error?:string}>}>} [applyMigration]
 */

export {};
