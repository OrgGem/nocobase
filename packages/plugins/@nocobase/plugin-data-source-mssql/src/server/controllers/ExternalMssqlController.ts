/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Database } from '@nocobase/database';
import { Context } from '@nocobase/resourcer';

export class ExternalMssqlController {
  async testConnection(ctx: Context) {
    const payload = ctx.action?.params?.values || ctx.request.body || {};
    const options = payload.options || payload;

    const database = new Database({
      ...options,
      dialect: 'mssql',
      dialectOptions: {
        ...(options?.dialectOptions || {}),
        options: {
          ...(options?.dialectOptions?.options || {}),
          ...(options?.encrypt === undefined ? {} : { encrypt: options.encrypt }),
        },
      },
    });

    try {
      await database.sequelize.authenticate();
      ctx.body = { status: 'success' };
    } catch (error) {
      ctx.status = 400;
      ctx.body = { status: 'error', message: error.message };
    } finally {
      await database.close();
    }
  }
}

export default ExternalMssqlController;
