export type CreateTableColumn = { name: string; type?: string; nullable?: boolean; primaryKey?: boolean; unique?: boolean; defaultValue?: string | null };
export function assertSafeIdent(name: string, label?: string): string;
export function buildCreateTableSql(input: { tableName: string; schema?: string; columns: CreateTableColumn[]; engine?: string }): { sql: string; tableName: string; schema: string | null; engine: string };
