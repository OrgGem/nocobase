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
import type { Dialect } from 'sequelize';
import fs from 'fs';
import path from 'path';

// MSSQL column type to NocoBase field type mapping
const MSSQL_FIELD_TYPE_MAP: Record<string, string | string[]> = {
  // String types
  char: ['string', 'uuid'],
  nchar: ['string', 'uuid'],
  varchar: ['string', 'uuid', 'nanoid'],
  nvarchar: ['string', 'uuid', 'nanoid'],
  text: 'text',
  ntext: 'text',

  // Integer types
  tinyint: ['integer', 'boolean', 'sort'],
  smallint: ['integer', 'sort'],
  int: ['integer', 'unixTimestamp', 'sort'],
  bigint: ['bigInt', 'unixTimestamp', 'sort'],

  // Decimal types
  decimal: 'decimal',
  numeric: 'decimal',
  money: 'decimal',
  smallmoney: 'decimal',
  float: 'float',
  real: 'float',

  // Date and time types
  date: 'dateOnly',
  time: 'time',
  datetime: ['datetimeNoTz', 'datetimeTz'],
  datetime2: ['datetimeNoTz', 'datetimeTz'],
  datetimeoffset: 'datetimeTz',
  smalldatetime: 'datetimeNoTz',

  // Boolean
  bit: 'boolean',

  // Binary types
  binary: 'string',
  varbinary: 'string',
  image: 'string',

  // Other types
  uniqueidentifier: 'uuid',
  xml: 'text',
};

type LocalCollectionData = {
  name: string;
  fields?: any[];
  [key: string]: any;
};

type LocalCollections = Record<string, LocalCollectionData>;

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
    dialect: 'mssql' as Dialect,
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
  addAllCollections?: boolean;
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

  /**
   * Extract the base type name from a MSSQL type definition
   * e.g., "varchar(255)" -> "varchar", "decimal(10,2)" -> "decimal"
   */
  private extractTypeFromDefinition(typeDefinition: string): string {
    const leftParenIndex = typeDefinition.indexOf('(');
    if (leftParenIndex === -1) {
      return typeDefinition.toLowerCase().trim();
    }
    return typeDefinition.substring(0, leftParenIndex).toLowerCase().trim();
  }

  /**
   * Map a MSSQL column type to a NocoBase field type
   */
  private mapColumnTypeToFieldType(columnType: string): { type: string; possibleTypes?: string[] } {
    const baseType = this.extractTypeFromDefinition(columnType);
    const mappedType = MSSQL_FIELD_TYPE_MAP[baseType];

    if (!mappedType) {
      return { type: 'string' }; // Default to string for unknown types
    }

    if (Array.isArray(mappedType)) {
      return { type: mappedType[0], possibleTypes: mappedType };
    }

    return { type: mappedType };
  }

  /**
   * Describe a table and get its columns with field type information
   */
  private async describeTable(tableName: string): Promise<any[]> {
    try {
      const queryInterface = this.database.sequelize.getQueryInterface();
      const columns = await queryInterface.describeTable(tableName);
      
      const fields: any[] = [];
      
      for (const [columnName, columnInfo] of Object.entries(columns as Record<string, any>)) {
        const typeInfo = this.mapColumnTypeToFieldType(columnInfo.type || 'varchar');
        
        const field: any = {
          name: columnName,
          type: typeInfo.type,
          primaryKey: columnInfo.primaryKey || false,
          autoIncrement: columnInfo.autoIncrement || false,
          allowNull: columnInfo.allowNull !== false,
        };
        
        // Add default value if present
        if (columnInfo.defaultValue !== undefined && columnInfo.defaultValue !== null) {
          field.defaultValue = columnInfo.defaultValue;
        }
        
        fields.push(field);
      }
      
      return fields;
    } catch (error) {
      this.logger?.warn?.(`Failed to describe table ${tableName}:`, error);
      return [];
    }
  }

  /**
   * Introspect tables from the MSSQL database and sync with local data
   */
  async syncFromDatabase(localData: LocalCollections = {}): Promise<void> {
    const introspector = this.createDatabaseIntrospector(this.database);
    const remoteTables = await introspector.getCollections();
    const localNames = Object.keys(localData);
    
    // addAllCollections: true means load all remote tables (default from UI form is true)
    // addAllCollections: false/undefined means only load tables explicitly in localData
    const addAllCollections = (this.options as MssqlDataSourceOptions)?.addAllCollections === true;
    let tablesToLoad: string[];
    
    if (addAllCollections) {
      // When addAllCollections is explicitly true, load all remote tables plus any additional local data
      tablesToLoad = Array.from(new Set([...remoteTables, ...localNames]));
    } else if (localNames.length > 0) {
      // When addAllCollections is false/undefined but there's local data, only load those tables
      tablesToLoad = localNames;
    } else {
      // When addAllCollections is false/undefined and no local data, load nothing
      // (This is the initial state before user selects specific collections)
      tablesToLoad = [];
    }
    
    const total = tablesToLoad.length;
    let loaded = 0;
    
    for (const tableName of tablesToLoad) {
      this.emit('loadMessage', { message: `Loading collection ${tableName}` });
      
      const local = localData?.[tableName] || {};
      const localFields = local.fields || [];
      
      // Get fields from the database table
      let dbFields: any[] = [];
      if (remoteTables.includes(tableName)) {
        dbFields = await this.describeTable(tableName);
      }
      
      // Merge local field customizations with database fields
      const mergedFields = this.mergeFields(dbFields, localFields);
      
      // Define or extend collection with introspected: true flag
      const collectionOptions = {
        name: tableName,
        introspected: true, // CRITICAL: This flag makes collections visible in UI
        ...local,
        fields: mergedFields,
      };
      
      if (this.collectionManager.hasCollection(tableName)) {
        (this.collectionManager as SequelizeCollectionManager).extendCollection(collectionOptions);
      } else {
        (this.collectionManager as SequelizeCollectionManager).defineCollection(collectionOptions);
      }
      
      loaded++;
      this.emitLoadingProgress({ total, loaded });
    }
  }

  /**
   * Merge database fields with local field customizations
   * Local fields take precedence for field properties like title, interface, etc.
   */
  private mergeFields(dbFields: any[], localFields: any[]): any[] {
    const localFieldMap = new Map(localFields.map((f) => [f.name, f]));
    
    const mergedFields = dbFields.map((dbField) => {
      const localField = localFieldMap.get(dbField.name);
      if (localField) {
        // Merge: local customizations override db introspection
        return { ...dbField, ...localField };
      }
      return dbField;
    });
    
    // Add any local fields that don't exist in the database (e.g., virtual fields)
    for (const localField of localFields) {
      const exists = mergedFields.some((f) => f.name === localField.name);
      if (!exists) {
        mergedFields.push(localField);
      }
    }
    
    return mergedFields;
  }

  async load(options: any = {}) {
    await super.load(options);
    
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
    
    // Create the introspector
    this.introspector = this.createDatabaseIntrospector(this.database);
    
    // Sync collections from database with local data
    const localData = options?.localData || {};
    await this.syncFromDatabase(localData);
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
      const message = error instanceof Error ? error.message : String(error);
      const connectionError = new Error(`Failed to connect to MSSQL database: ${message}`) as Error & { cause?: any };
      connectionError.cause = error;
      throw connectionError;
    } finally {
      await database.close();
    }
  }
}
