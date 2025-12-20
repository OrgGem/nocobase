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
  dialectOptions?: any;
  collectionManager?: any;
  timezone?: string;
  logging?: any;
  [key: string]: any;
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
    const database = new Database(formatDatabaseOptions(options));

    try {
      await database.sequelize.authenticate();
      return true;
    } finally {
      await database.close();
    }
  }
}
