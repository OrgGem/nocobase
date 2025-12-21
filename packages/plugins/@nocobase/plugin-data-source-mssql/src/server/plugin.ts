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
  async afterLoad() {
    Database.registerDialect(MssqlDialect);
    this.app.dataSourceManager.factory.register('mssql', MssqlExternalDataSource);

    const controller = new ExternalMssqlController();

    this.app.resourcer.define({
      name: 'external-mssql',
      actions: {
        async testConnection(ctx, next) {
          await controller.testConnection(ctx);
          await next();
        },
      },
      only: ['testConnection'],
    });
  }
}

export default PluginDataSourceMssqlServer;
