/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';
import { Database, formatDatabaseOptions } from '@nocobase/database';
import { sanitize } from '@nocobase/utils';

export class ExternalPostgresController {
  async testConnection(ctx: Context, next: Next) {
    const options = ctx.action.params.values;
    if (!options) {
      throw new Error('Options required');
    }

    // Basic validation
    if (!options.host) throw new Error('Host is required');
    if (!options.database) throw new Error('Database is required');

    // Create temporary database instance to test connection
    const dbOptions = formatDatabaseOptions(options);
    const database = new Database({
      ...dbOptions,
      dialect: 'postgres',
    });

    try {
      await database.sequelize.authenticate();
      ctx.body = true;
    } catch (error) {
      console.error('Connection test failed:', error);
      // Return friendly error message
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Connection failed: ${message}`);
    } finally {
      await database.close();
    }

    await next();
  }
}
