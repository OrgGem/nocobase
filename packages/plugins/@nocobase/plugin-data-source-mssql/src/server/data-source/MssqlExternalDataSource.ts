/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Database } from '@nocobase/database';
import { DataSource, SequelizeCollectionManager } from '@nocobase/data-source-manager';
import fs from 'fs';
import path from 'path';

const MSSQL_DRIVER_NAME = 'tedious';

const resolveMssqlDriverPath = () => {
  const candidates = [
    path.join(__dirname, '../tedious'),
    path.join(__dirname, '../../node_modules'),
    process.cwd(),
    __dirname,
  ];

  for (const candidate of candidates) {
    try {
      const basePath = fs.existsSync(candidate) ? candidate : undefined;
      if (basePath) {
        return require.resolve(MSSQL_DRIVER_NAME, { paths: [basePath] });
      }
    } catch (e) {
      // continue searching
    }
  }

  return undefined;
};

const formatDatabaseOptions = (options: MssqlDataSourceOptions = {}) => {
  const {
    host,
    port,
    username,
    password,
    database,
    schema,
    tablePrefix,
    dialectOptions,
    encrypt,
    timezone,
    logging,
    pool,
    underscored,
    sqlLogger,
    logger,
  } = options;

  const dialectModulePath = resolveMssqlDriverPath();
  const mergedDialectOptions = {
    ...(dialectOptions || {}),
    options: {
      ...(dialectOptions?.options || {}),
      ...(encrypt === undefined ? {} : { encrypt }),
    },
  };

  return {
    host,
    port,
    username,
    password,
    database,
    schema,
    tablePrefix,
    ...(dialectModulePath ? { dialectModulePath } : {}),
    dialectOptions: mergedDialectOptions,
    dialect: 'mssql',
    timezone,
    logging,
    pool,
    underscored,
    logger: sqlLogger || logger,
  };
};

export type MssqlDataSourceOptions = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  schema?: string;
  tablePrefix?: string;
  encrypt?: boolean;
  dialectOptions?: {
    options?: Record<string, any>;
    [key: string]: any;
  };
  collectionManager?: {
    database?: Database;
    [key: string]: any;
  };
  timezone?: string;
  logging?: boolean | ((...args: any[]) => void);
  pool?: any;
  underscored?: boolean;
  sqlLogger?: any;
  logger?: any;
  name?: string;
  cache?: any;
  storagePath?: string;
};

export class MssqlExternalDataSource extends DataSource {
  database: Database;
  introspector: { getCollections: () => Promise<string[]> };

  protected buildDatabaseOptions(options: MssqlDataSourceOptions = {}) {
    return formatDatabaseOptions(options);
  }

  createCollectionManager(options: MssqlDataSourceOptions = {}) {
    const databaseOptions = this.buildDatabaseOptions(options);
    const collectionOptions = options.collectionManager || {};
    const database =
      collectionOptions.database instanceof Database ? collectionOptions.database : new Database(databaseOptions);

    this.database = database;

    return new SequelizeCollectionManager({
      ...collectionOptions,
      database,
    });
  }

  createDatabaseIntrospector(db: Database) {
    return {
      getCollections: async () => {
        const queryInterface = db.sequelize.getQueryInterface();
        const tables = await queryInterface.showAllTables();
        return tables.map((table: any) => {
          if (typeof table === 'string') {
            return table;
          }
          return table?.tableName || table?.name || `${table}`;
        });
      },
    };
  }

  async load() {
    await super.load();
    
    // Authenticate database connection
    try {
      await this.database.sequelize.authenticate();
      this.logger?.info?.('MSSQL database connection established successfully');
    } catch (error) {
      this.logger?.error?.('Failed to authenticate MSSQL database connection', error);
      throw error;
    }
    
    // Check database version
    try {
      await this.database.checkVersion();
    } catch (error) {
      this.logger?.warn?.('Database version check failed', error);
      // Continue even if version check fails
    }
    
    this.introspector = this.createDatabaseIntrospector(this.database);
  }

  publicOptions() {
    const { password, ...rest } = this.options || {};
    return rest;
  }

  async close() {
    await this.database?.close();
  }

  static async testConnection(options?: MssqlDataSourceOptions): Promise<boolean> {
    // Validate required options
    if (!options) {
      throw new Error('Connection options are required to test MSSQL connectivity');
    }

    if (!options.host || typeof options.host !== 'string' || !options.host.trim()) {
      throw new Error('Host is required to test the connection');
    }

    if (!options.database || typeof options.database !== 'string' || !options.database.trim()) {
      throw new Error('Database name is required to test the connection');
    }

    if (!options.username || typeof options.username !== 'string' || !options.username.trim()) {
      throw new Error('Username is required to test the connection');
    }

    if (!options.password || typeof options.password !== 'string' || !options.password.trim()) {
      throw new Error('Password is required to test the connection');
    }

    const database = new Database(formatDatabaseOptions(options));

    try {
      await database.sequelize.authenticate();
      return true;
    } catch (error) {
      // Preserve original error information while providing context
      const message = error.message || 'Unknown error occurred';
      const connectionError = new Error(`Failed to connect to MSSQL database: ${message}`) as Error & { cause?: any };
      connectionError.cause = error;
      throw connectionError;
    } finally {
      await database.close();
    }
  }
}
