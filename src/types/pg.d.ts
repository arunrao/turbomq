declare module 'pg' {
  export interface PoolConfig {
    connectionString?: string;
    ssl?: boolean;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    query(text: string, values?: any[]): Promise<QueryResult>;
  }

  export interface PoolClient {
    query(text: string, values?: any[]): Promise<QueryResult>;
    release(): void;
  }

  export interface QueryResult {
    rows: any[];
    rowCount: number;
  }
} 