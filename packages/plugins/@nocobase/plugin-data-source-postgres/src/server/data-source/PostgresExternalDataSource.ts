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
import { PostgresCollectionManager } from './PostgresCollectionManager';
import type { Dialect } from 'sequelize';

const formatDatabaseOptions = (options: PostgresDataSourceOptions = {}) => {
  const {
    host,
    port,
    username,
    password,
    database,
    schema,
    tablePrefix,
    dialectOptions,
    ssl,
    timezone,
    logging,
    pool,
    underscored,
    sqlLogger,
    logger,
  } = options;

  const mergedDialectOptions = {
    ...(dialectOptions || {}),
    ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  };

  return {
    host,
    port,
    username,
    password,
    database,
    schema: schema || 'public',
    tablePrefix,
    dialectOptions: mergedDialectOptions,
    dialect: 'postgres' as Dialect,
    timezone,
    logging,
    pool,
    underscored,
    logger: sqlLogger || logger,
  };
};

export type PostgresDataSourceOptions = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  schema?: string;
  tablePrefix?: string;
  ssl?: boolean;
  dialectOptions?: any;
  timezone?: string;
  logging?: any;
  pool?: any;
  underscored?: boolean;
  sqlLogger?: any;
  logger?: any;
  collectionManager?: {
    database?: Database;
    [key: string]: any;
  };
  name?: string;
};

export class PostgresExternalDataSource extends DataSource {
  database: Database;
  introspector: { getCollections: () => Promise<any[]>; getFields: (table: any) => Promise<any[]> };

  protected buildDatabaseOptions(options: PostgresDataSourceOptions = {}) {
    return formatDatabaseOptions(options);
  }

  createCollectionManager(options: PostgresDataSourceOptions = {}) {
    const databaseOptions = this.buildDatabaseOptions(options);
    const collectionOptions = options.collectionManager || {};
    const database =
      collectionOptions.database instanceof Database ? collectionOptions.database : new Database(databaseOptions);

    this.database = database;

    return new PostgresCollectionManager({
      ...collectionOptions,
      database,
    });
  }

  createDatabaseIntrospector(db: Database) {
    const queryInterface = db.sequelize.getQueryInterface();
    return {
      getCollections: async () => {
        const tables = await queryInterface.showAllTables();
        return tables.map((tableName: any) => {
          if (typeof tableName === 'string') {
            return { tableName, schema: this.options.schema || 'public' };
          }
          return {
            tableName: tableName.tableName || tableName,
            schema: tableName.schema || this.options.schema || 'public',
          };
        });
      },
      getFields: async (table: string | { tableName: string; schema?: string }) => {
        const columns = await queryInterface.describeTable(table);
        const fields = [];
        let hasPrimaryKey = false;
        let idField = null;

        const name =
          typeof table === 'string' ? table : table.schema ? `${table.schema}.${table.tableName}` : table.tableName;
        console.log(`Introspecting fields for ${name}:`, columns);

        for (const [fieldName, column] of Object.entries(columns)) {
          const col = column as any;
          if (!col.type) {
            console.error(`[Postgres] Field ${fieldName} in table ${name} has no type!`, col);
            col.type = 'text';
          }
          const { type, interface: uiInterface, uiSchema: typeUiSchema } = this.inferFieldType(col.type);

          // Check for Postgres default expressions
          const rawDefaultValue = col.defaultValue;
          const isSqlExpression =
            rawDefaultValue &&
            typeof rawDefaultValue === 'string' &&
            (rawDefaultValue.startsWith('nextval') ||
              rawDefaultValue.includes('::') ||
              rawDefaultValue.endsWith('()') ||
              rawDefaultValue.includes('CURRENT_TIMESTAMP') ||
              rawDefaultValue.includes('now()'));

          const fieldDef: any = {
            name: fieldName,
            type,
            interface: uiInterface,
            field: fieldName,
            primaryKey: col.primaryKey,
            autoIncrement: col.autoIncrement,
            allowNull: col.allowNull,
            defaultValue: isSqlExpression ? undefined : rawDefaultValue,
            rawDefaultValue,
            uiSchema: {
              ...typeUiSchema,
              title: fieldName,
            },
          };

          if (col.primaryKey) {
            hasPrimaryKey = true;
          }

          if (fieldName.toLowerCase() === 'id') {
            idField = fieldDef;
          }

          fields.push(fieldDef);
        }

        if (!hasPrimaryKey && idField) {
          idField.primaryKey = true;
        }

        return fields;
      },
    };
  }

  private inferFieldType(dbType: string): { type: string; interface?: string; uiSchema?: any } {
    const type = dbType.split('(')[0].toLowerCase();

    const map: Record<string, { type: string; interface?: string; uiSchema?: any }> = {
      integer: {
        type: 'integer',
        interface: 'integer',
        uiSchema: {
          type: 'number',
          'x-component': 'InputNumber',
          'x-component-props': { stringMode: true, step: '1' },
        },
      },
      serial: {
        type: 'integer',
        interface: 'integer',
        uiSchema: {
          type: 'number',
          'x-component': 'InputNumber',
          'x-component-props': { stringMode: true, step: '1' },
        },
      },
      int: {
        type: 'integer',
        interface: 'integer',
        uiSchema: {
          type: 'number',
          'x-component': 'InputNumber',
          'x-component-props': { stringMode: true, step: '1' },
        },
      },
      int4: {
        type: 'integer',
        interface: 'integer',
        uiSchema: {
          type: 'number',
          'x-component': 'InputNumber',
          'x-component-props': { stringMode: true, step: '1' },
        },
      },
      smallint: {
        type: 'integer',
        interface: 'integer',
        uiSchema: {
          type: 'number',
          'x-component': 'InputNumber',
          'x-component-props': { stringMode: true, step: '1' },
        },
      },
      int2: {
        type: 'integer',
        interface: 'integer',
        uiSchema: {
          type: 'number',
          'x-component': 'InputNumber',
          'x-component-props': { stringMode: true, step: '1' },
        },
      },
      bigint: {
        type: 'bigInt',
        interface: 'integer',
        uiSchema: {
          type: 'number',
          'x-component': 'InputNumber',
          'x-component-props': { stringMode: true, step: '1' },
        },
      },
      bigserial: {
        type: 'bigInt',
        interface: 'integer',
        uiSchema: {
          type: 'number',
          'x-component': 'InputNumber',
          'x-component-props': { stringMode: true, step: '1' },
        },
      },
      int8: {
        type: 'bigInt',
        interface: 'integer',
        uiSchema: {
          type: 'number',
          'x-component': 'InputNumber',
          'x-component-props': { stringMode: true, step: '1' },
        },
      },
      numeric: {
        type: 'decimal',
        interface: 'number',
        uiSchema: { type: 'number', 'x-component': 'InputNumber', 'x-component-props': { stringMode: true } },
      },
      decimal: {
        type: 'decimal',
        interface: 'number',
        uiSchema: { type: 'number', 'x-component': 'InputNumber', 'x-component-props': { stringMode: true } },
      },
      real: { type: 'float', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber' } },
      'double precision': {
        type: 'float',
        interface: 'number',
        uiSchema: { type: 'number', 'x-component': 'InputNumber' },
      },
      float4: { type: 'float', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber' } },
      float8: { type: 'float', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber' } },
      text: { type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea' } },
      varchar: { type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input' } },
      'character varying': { type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input' } },
      char: { type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input' } },
      character: { type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input' } },
      uuid: { type: 'uuid', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input' } },
      boolean: { type: 'boolean', interface: 'checkbox', uiSchema: { type: 'boolean', 'x-component': 'Checkbox' } },
      bool: { type: 'boolean', interface: 'checkbox', uiSchema: { type: 'boolean', 'x-component': 'Checkbox' } },
      json: { type: 'json', interface: 'json', uiSchema: { type: 'string', 'x-component': 'Input.TextArea' } },
      jsonb: { type: 'json', interface: 'json', uiSchema: { type: 'string', 'x-component': 'Input.TextArea' } },
      'timestamp with time zone': {
        type: 'datetime',
        interface: 'datetime',
        uiSchema: { type: 'string', 'x-component': 'DatePicker', 'x-component-props': { showTime: true } },
      },
      timestamptz: {
        type: 'datetime',
        interface: 'datetime',
        uiSchema: { type: 'string', 'x-component': 'DatePicker', 'x-component-props': { showTime: true } },
      },
      'timestamp without time zone': {
        type: 'datetime',
        interface: 'datetime',
        uiSchema: { type: 'string', 'x-component': 'DatePicker', 'x-component-props': { showTime: true } },
      },
      timestamp: {
        type: 'datetime',
        interface: 'datetime',
        uiSchema: { type: 'string', 'x-component': 'DatePicker', 'x-component-props': { showTime: true } },
      },
      date: {
        type: 'dateOnly',
        interface: 'dateOnly',
        uiSchema: { type: 'string', 'x-component': 'DatePicker', 'x-component-props': { showTime: false } },
      },
      time: { type: 'time', interface: 'time', uiSchema: { type: 'string', 'x-component': 'TimePicker' } },
      'time without time zone': {
        type: 'time',
        interface: 'time',
        uiSchema: { type: 'string', 'x-component': 'TimePicker' },
      },
    };

    return map[type] || { type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input' } };
  }

  async load() {
    await super.load();

    // Ensure database instance is available
    // SequelizeCollectionManager stores database as 'db' property, not 'database'
    if (!this.database && (this.collectionManager as any).db) {
      this.database = (this.collectionManager as any).db;
    }

    if (!this.database) {
      this.logger?.error?.('Database not initialized. collectionManager:', this.collectionManager);
      throw new Error('Database instance not initialized in PostgresExternalDataSource');
    }

    // Authenticate database connection
    try {
      if (this.database.sequelize) {
        await this.database.sequelize.authenticate();
        this.logger?.info?.('PostgreSQL database connection established successfully');
      }
    } catch (error: any) {
      this.logger?.error?.('Failed to authenticate PostgreSQL database connection', error);
      throw error;
    }

    // Check database version
    try {
      await this.database.checkVersion();
    } catch (error: any) {
      this.logger?.warn?.('Database version check failed or not supported', error);
    }

    const introspector = this.createDatabaseIntrospector(this.database);
    this.introspector = introspector;

    try {
      const collections = await introspector.getCollections();
      for (const table of collections) {
        const schema = table.schema || 'public';
        const tableName = table.tableName;
        const fullTableName = `${schema}.${tableName}`;
        const collectionName = fullTableName.replace(/\./g, '_');

        try {
          const fields = await introspector.getFields(table);
          const pkField = fields.find((f: any) => f.primaryKey);

          const collectionOptions: any = {
            name: collectionName,
            title: fullTableName,
            tableName,
            schema,
            isExternal: true,
            introspected: true,
            template: 'general',
            autoGenId: false,
            timestamps: false,
            fields,
          };

          if (pkField) {
            collectionOptions.filterTargetKey = pkField.name;
          }

          if (!this.collectionManager.hasCollection(collectionName)) {
            await this.collectionManager.defineCollection(collectionOptions);
          } else {
            const collection = this.collectionManager.getCollection(collectionName);
            if (collection) {
              collection.updateOptions(collectionOptions);
              for (const field of fields) {
                if (!collection.hasField(field.name)) {
                  collection.setField(field.name, field);
                } else {
                  const existingField = collection.getField(field.name);
                  if (existingField) {
                    Object.assign(existingField.options, field);
                  }
                }
              }
            }
          }
        } catch (err: any) {
          this.logger?.error?.(`Failed to load collection ${fullTableName}: ${err.message}`, err);
        }
      }
    } catch (error: any) {
      this.logger?.error?.('Failed to introspect PostgreSQL database', error);
    }
  }

  publicOptions() {
    const { password, ...rest } = this.options || {};
    return {
      ...rest,
      host: this.options.host,
      port: this.options.port,
      username: this.options.username,
      database: this.options.database,
      schema: this.options.schema,
      tablePrefix: this.options.tablePrefix,
      ssl: this.options.ssl,
      isExternal: true,
      isDBInstance: true,
    };
  }

  async close() {
    await this.database?.close();
  }

  static async testConnection(options?: PostgresDataSourceOptions): Promise<boolean> {
    if (!options) {
      throw new Error('Connection options are required to test PostgreSQL connectivity');
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
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      const connectionError = new Error(`Failed to connect to PostgreSQL database: ${message}`) as Error & {
        cause?: any;
      };
      connectionError.cause = error;
      throw connectionError;
    } finally {
      await database.close();
    }
  }
}
