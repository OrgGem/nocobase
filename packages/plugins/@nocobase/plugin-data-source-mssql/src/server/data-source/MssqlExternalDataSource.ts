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
import { MssqlCollectionManager } from './MssqlCollectionManager';
import type { Dialect } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { sanitize } from '../utils';

const MSSQL_DRIVER_NAME = 'tedious';

const resolveMssqlDriverPath = () => {
  const candidates = [
    // In production build: __dirname is dist/server/data-source
    // tedious is copied to dist/tedious
    path.join(__dirname, '../../tedious'),

    // In development matches: src/server/data-source
    // tedious might be in root node_modules or plugin node_modules
    path.join(__dirname, '../../../node_modules'),

    // Legacy/Backup paths
    path.join(__dirname, '../tedious'),
    path.join(__dirname, '../../node_modules'),
    process.cwd(),
    __dirname,
  ];

  for (const candidate of candidates) {
    try {
      const basePath = fs.existsSync(candidate) ? candidate : undefined;
      // If candidate is a directory (like dist/tedious or node_modules), try to resolve tedious inside it
      if (basePath) {
        // If candidate is 'tedious' folder itself (dist/tedious)
        if (candidate.endsWith('tedious') && fs.existsSync(path.join(candidate, 'package.json'))) {
          console.log(`[MSSQL] Found bundled tedious at ${candidate}`);
          return require.resolve(candidate); // This might fail if candidate is strictly a folder not a package, but usually require.resolve on folder with package.json works
        }

        // If candidate is a node_modules folder
        try {
          const resolved = require.resolve(MSSQL_DRIVER_NAME, { paths: [basePath] });
          console.log(`[MSSQL] Resolved tedious via ${candidate} at ${resolved}`);
          return resolved;
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // continue searching
    }
  }

  // Fallback to standard node resolution
  try {
    const resolved = require.resolve(MSSQL_DRIVER_NAME);
    console.log(`[MSSQL] Resolved tedious via standard node resolution at ${resolved}`);
    return resolved;
  } catch (error) {
    console.error(`[MSSQL] Failed to resolve tedious driver. Error: ${error.message}`);
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
      // Use UTC to avoid timezone offset format issues with DATETIME columns
      useUTC: true,
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

  /**
   * Method called by NocoBase's plugin-data-source-manager to list all tables
   * when editing a datasource configuration
   */
  async readTables(): Promise<{ name: string; tableName: string }[]> {
    try {
      const introspector = this.createDatabaseIntrospector(this.database);
      const tables = await introspector.getCollections();

      // Handle both string and object table names from MSSQL driver
      // MSSQL's showAllTables() may return {tableName: 'Name', schema: 'dbo'} objects
      return tables.map((table: any) => {
        let tableName: string;

        if (typeof table === 'string') {
          tableName = table;
        } else if (table && typeof table === 'object') {
          // Object format: {tableName: 'TableName', schema: 'dbo'}
          if (table.schema && table.tableName) {
            tableName = `${table.schema}_${table.tableName}`;
          } else if (table.tableName) {
            tableName = table.tableName;
          } else if (table.name) {
            tableName = table.name;
          } else {
            // Fallback to stringifying or first property
            tableName = (Object.values(table).find((v) => typeof v === 'string') as string) || JSON.stringify(table);
          }
        } else {
          tableName = String(table);
        }

        return {
          name: tableName,
          tableName: tableName,
        };
      });
    } catch (error) {
      console.error('[MSSQL] Failed to read tables:', error);
      throw error;
    }
  }

  createCollectionManager(options: MssqlDataSourceOptions = {}) {
    const databaseOptions = this.buildDatabaseOptions(options);
    const collectionOptions = options.collectionManager || {};
    const database =
      collectionOptions.database instanceof Database ? collectionOptions.database : new Database(databaseOptions);

    this.database = database;

    return new MssqlCollectionManager({
      ...collectionOptions,
      database,
    });
  }

  createDatabaseIntrospector(db: Database) {
    const queryInterface = db.sequelize.getQueryInterface();
    return {
      getCollections: async () => {
        return queryInterface.showAllTables();
      },
      getFields: async (table: string | { tableName: string; schema?: string }) => {
        const columns = await queryInterface.describeTable(table);
        const name =
          typeof table === 'string' ? table : table.schema ? `${table.schema}.${table.tableName}` : table.tableName;
        console.log(`Introspecting fields for ${name}:`, columns);
        const fields = [];
        let hasPrimaryKey = false;
        let idField = null;

        for (const [name, column] of Object.entries(columns)) {
          const col = column as any;
          if (!col.type) {
            console.error(`[MSSQL] Field ${name} has no type!`, col);
            col.type = 'text';
          }
          const { type, interface: uiInterface, uiSchema: typeUiSchema } = this.inferFieldType(col.type);

          // Check if defaultValue is a MSSQL SQL expression (like (newid()) or ((0)))
          // These should not be passed to INSERT as literal values
          const rawDefaultValue = column.defaultValue;
          const isSqlExpression =
            rawDefaultValue &&
            typeof rawDefaultValue === 'string' &&
            rawDefaultValue.startsWith('(') &&
            rawDefaultValue.endsWith(')');

          const fieldDef: any = {
            name,
            type,
            interface: uiInterface,
            field: name,
            primaryKey: column.primaryKey,
            autoIncrement: column.autoIncrement,
            allowNull: column.allowNull,
            // Don't set defaultValue for SQL expressions - let MSSQL handle them
            defaultValue: isSqlExpression ? undefined : rawDefaultValue,
            // Store original default value as metadata for reference
            rawDefaultValue: rawDefaultValue,
            uiSchema: {
              ...typeUiSchema,
              title: name,
            },
          };

          if (column.primaryKey) {
            hasPrimaryKey = true;
          }

          if (name.toLowerCase() === 'id') {
            idField = fieldDef;
          }

          fields.push(fieldDef);
        }

        // ... existing loop ...

        if (!hasPrimaryKey) {
          try {
            const tableName = typeof table === 'string' ? table : table.tableName;
            const schemaName = typeof table === 'string' ? undefined : table.schema || 'dbo';

            // Fallback: Query sys.indexes for Primary Key
            const pkSql = `
                SELECT c.name AS column_name
                FROM sys.indexes i
                INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                INNER JOIN sys.columns c ON ic.object_id = c.object_id AND c.column_id = ic.column_id
                INNER JOIN sys.objects o ON i.object_id = o.object_id
                INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
                WHERE i.is_primary_key = 1
                AND o.name = ${db.sequelize.escape(tableName)}
                AND s.name = ${db.sequelize.escape(schemaName)}
             `;

            const pkResult = (await db.sequelize.query(pkSql, { type: 'SELECT' })) as any[];
            if (pkResult && pkResult.length > 0) {
              console.log(
                `[MSSQL] Found PK via raw query for ${name}:`,
                pkResult.map((r) => r.column_name),
              );
              for (const row of pkResult) {
                const pkField = fields.find((f) => f.name === row.column_name);
                if (pkField) {
                  pkField.primaryKey = true;
                  hasPrimaryKey = true;
                }
              }
            }
          } catch (err) {
            console.error(`[MSSQL] Failed to query PK for ${name}:`, err);
          }
        }

        if (!hasPrimaryKey && idField) {
          idField.primaryKey = true;
          hasPrimaryKey = true;
        }

        // Final fallback: If still no PK, warn and maybe force first column?
        // Or just let it be, but logging is crucial.
        if (!hasPrimaryKey && fields.length > 0) {
          console.warn(`[MSSQL] No Primary Key found for table ${name}. Collection usage might be limited.`);
        }

        return fields;
      },
    };
  }

  private isDatetimeString(value: string): boolean {
    // Check if string matches datetime pattern with timezone offset
    // e.g. 2026-01-04 17:00:00.000 +00:00 or 2026-01-04T17:00:00.000Z
    return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:\d{2})?)?$/.test(value);
  }

  private inferFieldType(dbType: string): { type: string; interface?: string; uiSchema?: any } {
    const type = dbType.split('(')[0].toLowerCase();
    const map: Record<string, { type: string; interface?: string; uiSchema?: any }> = {
      varchar: {
        type: 'string',
        interface: 'input',
        uiSchema: { type: 'string', 'x-component': 'Input' },
      },
      nvarchar: {
        type: 'string',
        interface: 'input',
        uiSchema: { type: 'string', 'x-component': 'Input' },
      },
      char: {
        type: 'string',
        interface: 'input',
        uiSchema: { type: 'string', 'x-component': 'Input' },
      },
      nchar: {
        type: 'string',
        interface: 'input',
        uiSchema: { type: 'string', 'x-component': 'Input' },
      },
      text: {
        type: 'text',
        interface: 'textarea',
        uiSchema: { type: 'string', 'x-component': 'Input.TextArea' },
      },
      ntext: {
        type: 'text',
        interface: 'textarea',
        uiSchema: { type: 'string', 'x-component': 'Input.TextArea' },
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
      smallint: {
        type: 'integer',
        interface: 'integer',
        uiSchema: {
          type: 'number',
          'x-component': 'InputNumber',
          'x-component-props': { stringMode: true, step: '1' },
        },
      },
      tinyint: {
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
      decimal: {
        type: 'decimal',
        interface: 'number',
        uiSchema: { type: 'number', 'x-component': 'InputNumber', 'x-component-props': { stringMode: true } },
      },
      numeric: {
        type: 'decimal',
        interface: 'number',
        uiSchema: { type: 'number', 'x-component': 'InputNumber', 'x-component-props': { stringMode: true } },
      },
      float: {
        type: 'float',
        interface: 'number',
        uiSchema: { type: 'number', 'x-component': 'InputNumber' },
      },
      real: {
        type: 'float',
        interface: 'number',
        uiSchema: { type: 'number', 'x-component': 'InputNumber' },
      },
      datetime: {
        type: 'datetime',
        interface: 'datetime',
        uiSchema: { type: 'string', 'x-component': 'DatePicker', 'x-component-props': { showTime: true } },
      },
      datetime2: {
        type: 'datetime',
        interface: 'datetime',
        uiSchema: { type: 'string', 'x-component': 'DatePicker', 'x-component-props': { showTime: true } },
      },
      date: {
        type: 'dateOnly',
        interface: 'dateOnly',
        uiSchema: { type: 'string', 'x-component': 'DatePicker', 'x-component-props': { showTime: false } },
      },
      time: {
        type: 'time',
        interface: 'time',
        uiSchema: { type: 'string', 'x-component': 'TimePicker' },
      },
      bit: {
        type: 'boolean',
        interface: 'checkbox',
        uiSchema: { type: 'boolean', 'x-component': 'Checkbox' },
      },
      uniqueidentifier: {
        type: 'uuid',
        interface: 'input',
        uiSchema: { type: 'string', 'x-component': 'Input' },
      },
      varbinary: {
        type: 'blob',
        uiSchema: { type: 'string', 'x-component': 'Input' },
      },
      image: {
        type: 'blob',
        uiSchema: { type: 'string', 'x-component': 'Input' },
      },
    };
    return map[type] || { type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input' } };
  }

  async load(options: any = {}) {
    await super.load(options);

    // Check for selective loading via localData (initial load) OR condition (updates)
    const { localData = {}, refresh = false, condition = {} } = options;
    const dataSourceConfig = (this as any).options || {};

    // Determine selective mode:
    // 1. If addAllCollections is explicitly false -> selective mode
    // 2. If addAllCollections is undefined but localData has entries -> selective mode (backward compat)
    // 3. If localData is empty and condition is empty -> load all
    const addAllCollectionsOption = options.addAllCollections ?? dataSourceConfig.addAllCollections;

    let selectedCollectionNames: string[] = [];

    // Gather potential selections from localData
    if (localData && Object.keys(localData).length > 0) {
      selectedCollectionNames.push(...Object.keys(localData));
    }

    // Gather potential selections from condition
    if (condition && condition.name && condition.name.$in) {
      const conditionNames = condition.name.$in;
      if (Array.isArray(conditionNames)) {
        selectedCollectionNames.push(...conditionNames);
      }
    }

    // Deduplicate
    selectedCollectionNames = Array.from(new Set(selectedCollectionNames));

    // Determine if we should filter:
    // - If addAllCollections is explicitly true -> don't filter, load all
    // - If addAllCollections is explicitly false -> filter by selections
    // - If addAllCollections is undefined -> filter ONLY if we have selections (backward compat)
    let isSelectiveMode = false;
    if (addAllCollectionsOption === true) {
      // Explicitly load all - override any stale localData
      isSelectiveMode = false;
      console.log('[MSSQL] addAllCollections=true, loading all collections');
    } else if (addAllCollectionsOption === false) {
      // Explicitly selective
      isSelectiveMode = true;
      console.log('[MSSQL] addAllCollections=false, using selective mode');
    } else {
      // Undefined - use localData/condition presence as indicator
      isSelectiveMode = selectedCollectionNames.length > 0;
      console.log(
        `[MSSQL] addAllCollections undefined, isSelectiveMode=${isSelectiveMode} (based on ${selectedCollectionNames.length} selections)`,
      );
    }

    const hasSelectedCollections = isSelectiveMode && selectedCollectionNames.length > 0;

    if (hasSelectedCollections) {
      (this as any).logger?.info?.(
        `[MSSQL] Loading ${
          selectedCollectionNames.length
        } selected collections (Selective Mode): ${selectedCollectionNames.join(', ')}`,
      );
      if ((this as any).logger?.debug) {
        (this as any).logger.debug(
          `[MSSQL DEBUG] Selection sources - localData keys: ${Object.keys(localData).join(
            ', ',
          )}, condition: ${JSON.stringify(condition)}`,
        );
      }
    } else {
      (this as any).logger?.info?.('[MSSQL] Loading all collections');
      console.log('[MSSQL] Loading ALL collections');
    }

    // Ensure database instance is available
    // SequelizeCollectionManager stores database as 'db' property, not 'database'
    if (!this.database && ((this as any).collectionManager as any).db) {
      this.database = ((this as any).collectionManager as any).db;
    }

    if (!this.database) {
      (this as any).logger?.error?.('Database not initialized. collectionManager:', (this as any).collectionManager);
      throw new Error('Database instance not initialized in MssqlExternalDataSource');
    }

    // Authenticate database connection
    try {
      if (this.database.sequelize) {
        await this.database.sequelize.authenticate();
        (this as any).logger?.info?.('MSSQL database connection established successfully');
      }
    } catch (error) {
      (this as any).logger?.error?.('Failed to authenticate MSSQL database connection', sanitize(error));
      throw error;
    }

    // Check database version
    try {
      await this.database.checkVersion();
    } catch (error) {
      (this as any).logger?.warn?.('Database version check failed or not supported', sanitize(error));
    }

    // Add global hook to handle datetime format for MSSQL
    // MSSQL DATETIME doesn't support timezone offset format like '+00:00'
    this.database.sequelize.addHook('beforeSave', (instance: any) => {
      if (instance && instance.dataValues) {
        // Access Sequelize constructor for literal
        const Sequelize = (this.database.sequelize as any).Sequelize;
        if (!Sequelize) return;

        for (const [key, value] of Object.entries(instance.dataValues)) {
          let dateValue: Date | null = null;

          // Handle both Date objects (which Sequelize creates) and valid datetime strings
          if (value instanceof Date) {
            dateValue = value;
          } else if (typeof value === 'string' && this.isDatetimeString(value)) {
            dateValue = new Date(value);
          }

          if (dateValue && !isNaN(dateValue.getTime())) {
            // Manual formatting to 'YYYY-MM-DD HH:mm:ss.SSS'
            const iso = dateValue.toISOString();
            // Remove T and Z to get 'YYYY-MM-DD HH:mm:ss.SSS'
            // This format (YYYY-MM-DD HH:mm:ss.SSS) works for MSSQL DATETIME
            const mssqlDate = iso.replace('T', ' ').replace('Z', '');

            if (Sequelize && Sequelize.literal) {
              console.log(`[MSSQL Hook] Converting field ${key} to literal: '${mssqlDate}'`);
              // Use literal to bypass Sequelize parameter binding which adds timezone
              instance.dataValues[key] = Sequelize.literal(`'${mssqlDate}'`);
            }
          }
        }
      }
    });

    // Add hook for handling datetime in WHERE conditions (filters)
    // This fixes the "Conversion failed when converting date and/or time from character string" error
    const transformDatesInObject = (obj: any, Sequelize: any): any => {
      if (!obj || typeof obj !== 'object') return obj;

      // Handle Date objects
      if (obj instanceof Date) {
        if (!isNaN(obj.getTime())) {
          const iso = obj.toISOString();
          const mssqlDate = iso.replace('T', ' ').replace('Z', '');
          return Sequelize.literal(`'${mssqlDate}'`);
        }
        return obj;
      }

      // Handle Arrays
      if (Array.isArray(obj)) {
        return obj.map((item) => transformDatesInObject(item, Sequelize));
      }

      // Handle plain objects - recursively process
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = transformDatesInObject(value, Sequelize);
      }
      return result;
    };

    this.database.sequelize.addHook('beforeFind', (options: any) => {
      if (!options || !options.where) return;

      const Sequelize = (this.database.sequelize as any).Sequelize;
      if (!Sequelize) return;

      try {
        options.where = transformDatesInObject(options.where, Sequelize);
      } catch (err) {
        console.error('[MSSQL] Error transforming dates in WHERE:', err);
      }
    });

    this.database.sequelize.addHook('beforeCount', (options: any) => {
      if (!options || !options.where) return;

      const Sequelize = (this.database.sequelize as any).Sequelize;
      if (!Sequelize) return;

      try {
        options.where = transformDatesInObject(options.where, Sequelize);
      } catch (err) {
        console.error('[MSSQL] Error transforming dates in WHERE:', err);
      }
    });

    const introspector = this.createDatabaseIntrospector(this.database);
    this.introspector = introspector;

    try {
      (this as any).logger?.info?.('[MSSQL] Introspecting collections...');
      const collections = await introspector.getCollections();
      (this as any).logger?.info?.(`[MSSQL] Found ${collections.length} tables in database.`);

      for (const table of collections) {
        let collectionName: string;
        let fullTableName: string;

        // MATCH readTables logic for consistent naming
        if (typeof table === 'string') {
          collectionName = table;
          fullTableName = table;
        } else {
          const t = table as any;
          if (t.schema && t.tableName) {
            collectionName = `${t.schema}_${t.tableName}`;
            fullTableName = `${t.schema}.${t.tableName}`;
          } else if (t.tableName) {
            collectionName = t.tableName;
            fullTableName = t.tableName;
          } else {
            collectionName = t.name || JSON.stringify(t);
            fullTableName = collectionName;
          }
        }

        const shouldLoad = !hasSelectedCollections || selectedCollectionNames.includes(collectionName);

        // AGGRESSIVE DEBUG LOG
        console.log(
          `[MSSQL] Processing table: ${fullTableName} (Collection: ${collectionName}) -> Selected: ${shouldLoad}`,
        );

        if ((this as any).logger?.debug) {
          (this as any).logger.debug(
            `[MSSQL DEBUG] Introspected table: ${JSON.stringify(
              table,
            )} -> collectionName: '${collectionName}'. Selected: ${shouldLoad}`,
          );
        }

        if (!shouldLoad) {
          continue;
        }
        try {
          console.log(`[MSSQL] Getting fields for ${fullTableName}...`);
          let fields = [];
          try {
            fields = await introspector.getFields(table);
          } catch (e) {
            console.warn(`[MSSQL] First attempt to get fields for ${fullTableName} failed: ${e.message}`);
            if (typeof table !== 'string') {
              // Retry with string format
              const fallbackName = (table as any).schema
                ? `${(table as any).schema}.${(table as any).tableName}`
                : (table as any).tableName;
              console.log(`[MSSQL] Retrying getFields with string name: ${fallbackName}`);
              fields = await introspector.getFields(fallbackName);
            } else {
              throw e;
            }
          }
          console.log(`[MSSQL] Found ${fields.length} fields for ${fullTableName}`);

          const pkField = fields.find((f) => f.primaryKey);
          const collectionOptions: any = {
            name: collectionName,
            title: fullTableName,
            tableName: typeof table === 'string' ? table : (table as any).tableName,
            schema: typeof table === 'string' ? undefined : (table as any).schema,
            isExternal: true,
            introspected: true,
            template: 'general',
            autoGenId: false,
            timestamps: false,
            fields,
            repository: 'mssql-repo', // Use MSSQL-specific repository with cursor-based pagination
          };

          if (pkField) {
            collectionOptions.filterTargetKey = pkField.name;
          } else {
            // Fallback if no PK found: use 'id' if exists, otherwise first field?
            // Without filterTargetKey, Actions like 'get'/'destroy' with TK will fail
            const idField = fields.find((f) => f.name.toLowerCase() === 'id');
            if (idField) {
              collectionOptions.filterTargetKey = idField.name;
              console.warn(`[MSSQL] Using '${idField.name}' as filterTargetKey for ${collectionName} (fallback)`);
            } else if (fields.length > 0) {
              // Dangerous fallback but better than crash?
              collectionOptions.filterTargetKey = fields[0].name;
              console.warn(
                `[MSSQL] Using first column '${fields[0].name}' as filterTargetKey for ${collectionName} (last resort)`,
              );
            }
          }

          if (!(this as any).collectionManager.hasCollection(collectionName)) {
            console.log(`[MSSQL] Defining collection ${collectionName} ...`);
            await (this as any).collectionManager.defineCollection(collectionOptions);
            console.log(`[MSSQL] Defined collection ${collectionName} successfully.`);
          } else {
            // Update existing collection's fields if necessary
            const collection = (this as any).collectionManager.getCollection(collectionName);
            if (collection) {
              console.log(`[MSSQL] Updating collection ${collectionName}`);
              collection.updateOptions(collectionOptions);
              for (const field of fields) {
                if (!collection.hasField(field.name)) {
                  console.log(`[MSSQL] Adding field ${field.name} to ${collectionName}`);
                  collection.setField(field.name, field);
                } else {
                  const existingField = collection.getField(field.name);
                  if (existingField) {
                    Object.assign(existingField.options, field);
                  }
                }
              }
            } else {
              (this as any).logger?.warn?.(
                `Collection ${collectionName} reported as existing but not found by getCollection`,
              );
            }
          }
        } catch (err: any) {
          console.error(`[MSSQL ERROR] Failed to load collection ${fullTableName}: ${err.message}`, err);
          (this as any).logger?.error?.(`Failed to load collection ${fullTableName}: ${err.message}`, sanitize(err));
        }
      }
    } catch (error) {
      console.error('[MSSQL CRITICAL] Failed to introspect MSSQL database', error);
      (this as any).logger?.error?.('Failed to introspect MSSQL database', sanitize(error));
    }
  }

  publicOptions() {
    const { password, ...rest } = (this as any).options || {};
    return {
      ...rest,
      host: (this as any).options.host,
      port: (this as any).options.port,
      username: (this as any).options.username,
      database: (this as any).options.database,
      schema: (this as any).options.schema,
      tablePrefix: (this as any).options.tablePrefix,
      encrypt: (this as any).options.encrypt,
      isExternal: true,
      isDBInstance: true,
    };
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
