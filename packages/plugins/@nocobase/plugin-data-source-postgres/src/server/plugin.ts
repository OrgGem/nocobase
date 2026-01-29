/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/server';
import { Database } from '@nocobase/database';
import { PostgresDialect } from './dialects/postgres-dialect';
import { PostgresExternalDataSource } from './data-source/PostgresExternalDataSource';
import { ExternalPostgresController } from './controllers/ExternalPostgresController';

export class PluginDataSourcePostgresServer extends Plugin {
  async beforeLoad() {
    // Register Dialect
    Database.registerDialect(PostgresDialect);

    // Register DataSource Factory
    this.app.dataSourceManager.factory.register('postgres', PostgresExternalDataSource);
  }

  async load() {
    const controller = new ExternalPostgresController();

    // Register Test Connection Resource
    this.app.resourcer.define({
      name: 'external-postgres',
      actions: {
        async testConnection(ctx, next) {
          await controller.testConnection(ctx, next);
        },
      },
    });

    // Hook into the app load process to ensure all resources are registered
    this.app.on('afterLoad', async () => {
      try {
        // Get the dataSources.collections resource
        // This resource is defined in plugin-data-source-manager
        const resource = this.app.resourcer.getResource('dataSources.collections');

        if (!resource) {
          console.error('[Postgres Plugin] dataSources.collections resource not found');
          return;
        }

        // If destroy action doesn't exist, we add it
        // This is necessary because data-source-manager doesn't define it
        if (!resource.actions.has('destroy')) {
          console.log('[Postgres Plugin] Adding missing destroy action to dataSources.collections');
          resource.addAction('destroy', async (ctx, next) => {
            await next();
          });
        }

        // Get the action instance
        const action = resource.getAction('destroy');

        // Add our Postgres-specific handler to the middleware chain
        action.middlewares.push(async (ctx, next) => {
          const params = ctx.action?.params || {};
          const { associatedIndex: dataSourceKey, filterByTk: collectionName } = params;

          if (!dataSourceKey || !collectionName) {
            return next();
          }

          const dataSource = ctx.app.dataSourceManager.dataSources.get(dataSourceKey);

          // Only handle Postgres data sources
          if (dataSource && dataSource.constructor.name === 'PostgresExternalDataSource') {
            console.log('[Postgres Plugin] Intercepted destroy action for:', { dataSourceKey, collectionName });

            try {
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

              console.log('[Postgres Plugin] Collection deleted successfully:', collectionName);

              ctx.body = { success: true };
              // We don't call next() because we've handled the request
              return;
            } catch (error) {
              console.error('[Postgres Plugin] Error deleting collection:', error);
              throw error;
            }
          }

          await next();
        });

        console.log('[Postgres Plugin] Registered destroy middleware for Postgres data sources');
      } catch (error) {
        console.error('[Postgres Plugin] Failed to register destroy action:', error);
      }
    });
  }
}

export default PluginDataSourcePostgresServer;
