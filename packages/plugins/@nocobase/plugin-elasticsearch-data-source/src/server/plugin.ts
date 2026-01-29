/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/server';
import { ElasticsearchDataSource } from './data-source/ElasticsearchDataSource';
import { ExternalElasticsearchController } from './controllers/ExternalElasticsearchController';

export class PluginElasticsearchDataSourceServer extends Plugin {
  async beforeLoad() {
    this.app.dataSourceManager.factory.register('elasticsearch', ElasticsearchDataSource);
  }

  async load() {
    const controller = new ExternalElasticsearchController();

    // Register test connection resource
    this.app.resourcer.define({
      name: 'external-elasticsearch',
      actions: {
        async testConnection(ctx, next) {
          await controller.testConnection(ctx);
          await next();
        },
      },
      only: ['testConnection'],
    });

    // Add middleware to handle collection destroy for elasticsearch data sources
    this.app.use(
      async (ctx: any, next: () => Promise<void>) => {
        // Parse the request path to check if it's a dataSources collections destroy request
        const path = ctx.request?.path || '';
        const method = ctx.request?.method || '';

        // Match URL pattern: /api/dataSources/{dataSourceKey}/collections:destroy
        const destroyMatch = path.match(/^\/api\/dataSources\/([^/]+)\/collections:destroy$/);

        if (destroyMatch && method.toUpperCase() === 'POST') {
          const dataSourceKey = destroyMatch[1];
          const collectionName = ctx.query?.filterByTk || ctx.request?.query?.filterByTk;

          if (dataSourceKey && collectionName) {
            const dataSource = ctx.app.dataSourceManager.dataSources.get(dataSourceKey);

            // Check if this is an elasticsearch data source
            if (dataSource && dataSource.constructor.name === 'ElasticsearchDataSource') {
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
                if (dataSource.collectionManager?.removeCollection) {
                  dataSource.collectionManager.removeCollection(collectionName);
                }

                ctx.status = 200;
                ctx.body = { success: true };
                return; // Don't call next() - we've handled the request
              } catch (error) {
                console.error('[Elasticsearch Plugin] Error deleting collection:', error);
                ctx.status = 500;
                ctx.body = { error: (error as Error).message };
                return;
              }
            }
          }
        }

        // Not our request, continue to next middleware
        await next();
      },
      { before: 'resourcer' },
    );
  }
}

export default PluginElasticsearchDataSourceServer;
