/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/server';
import { MssqlExternalDataSource } from './data-source/MssqlExternalDataSource';
import { ExternalMssqlController } from './controllers/ExternalMssqlController';
import { Database } from '@nocobase/database';
import { MssqlDialect } from './dialects/mssql-dialect';

export class PluginDataSourceMssqlServer extends Plugin {
  async beforeLoad() {
    Database.registerDialect(MssqlDialect);
    (this as any).app.dataSourceManager.factory.register('mssql', MssqlExternalDataSource);
  }

  async load() {
    const controller = new ExternalMssqlController();

    (this as any).app.resourcer.define({
      name: 'external-mssql',
      actions: {
        async testConnection(ctx, next) {
          await controller.testConnection(ctx);
          await next();
        },
      },
      only: ['testConnection'],
    });

    // Add readTables action to dataSources resource for MSSQL
    (this as any).app.resourcer.use(async (ctx, next) => {
      const { resourceName, actionName } = ctx.action?.params || {};

      // Intercept dataSources:readTables for mssql type data sources
      if (resourceName === 'dataSources' && actionName === 'readTables') {
        const { values } = ctx.action.params;
        const { type, options } = values || {};

        if (type === 'mssql' && options) {
          try {
            // Create a temporary datasource to introspect tables
            const dataSource = new MssqlExternalDataSource({
              name: 'temp_introspection',
              ...options,
            });

            // Use the built-in readTables method which handles initialization properly
            const tables = await dataSource.readTables();

            // Close the temporary connection
            await dataSource.close();

            ctx.body = tables;
            return;
          } catch (error) {
            console.error('[MSSQL] readTables failed:', error);
            ctx.throw(500, `Failed to read tables: ${error.message}`);
          }
        }
      }

      await next();
    });

    // Add middleware to handle collection destroy for mssql data sources
    (this as any).app.resourcer.use(async (ctx, next) => {
      const { resourceName, actionName, associatedIndex: dataSourceKey } = ctx.action?.params || {};

      // Only intercept dataSources.collections:destroy for mssql type data sources
      if (resourceName === 'dataSources.collections' && actionName === 'destroy' && dataSourceKey) {
        const dataSource = (this as any).app.dataSourceManager.dataSources.get(dataSourceKey);

        // Check if this is an mssql data source
        if (dataSource && dataSource.constructor.name === 'MssqlExternalDataSource') {
          const { filterByTk: collectionName } = ctx.action.params;

          if (collectionName) {
            // Remove from dataSourcesCollections table (metadata)
            await ctx.db.getRepository('dataSourcesCollections').destroy({
              filter: {
                name: collectionName,
                dataSourceKey,
              },
            });

            // Remove associated fields from metadata
            await ctx.db.getRepository('dataSourcesFields').destroy({
              filter: {
                collectionName,
                dataSourceKey,
              },
            });

            // Remove from in-memory collection manager
            dataSource.collectionManager.removeCollection(collectionName);

            ctx.body = { success: true };
            return; // Don't call next() - we handled the action
          }
        }
      }

      await next();
    });
    // Inject get and create actions for dataSources.collections
    (this as any).app.on('afterLoad', async () => {
      const collectionResource = (this as any).app.resourcer.getResource('dataSources.collections');
      if (!collectionResource) return;

      if (!collectionResource.actions.has('get')) {
        collectionResource.addAction('get', async (ctx, next) => {
          const { associatedIndex: dataSourceKey, filterByTk: collectionName } = ctx.action.params;
          const dataSource = (this as any).app.dataSourceManager.dataSources.get(dataSourceKey);
          if (dataSource && dataSource.constructor.name === 'MssqlExternalDataSource') {
            const collection = dataSource.collectionManager.getCollection(collectionName);
            if (!collection) {
              ctx.throw(404, `collection ${collectionName} not found`);
            }

            ctx.body = {
              ...collection.options,
              fields: collection.getFields().map((field) => field.options),
            };
          }
          await next();
        });
      }

      if (!collectionResource.actions.has('create')) {
        collectionResource.addAction('create', async (ctx, next) => {
          const { associatedIndex: dataSourceKey, values } = ctx.action.params;
          const dataSource = (this as any).app.dataSourceManager.dataSources.get(dataSourceKey);

          if (dataSource && dataSource.constructor.name === 'MssqlExternalDataSource') {
            const collection = await dataSource.collectionManager.createCollection(values);
            await collection.sync();

            await ctx.db.getRepository('dataSourcesCollections').create({
              values: {
                name: collection.name,
                dataSourceKey,
              },
            });

            ctx.body = {
              ...collection.options,
              fields: collection.getFields().map((field) => field.options),
            };
          }
          await next();
        });
      }
    });
  }
}

export default PluginDataSourceMssqlServer;
