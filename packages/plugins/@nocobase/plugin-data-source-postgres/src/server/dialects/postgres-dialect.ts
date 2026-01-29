/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { BaseDialect, DatabaseOptions } from '@nocobase/database';

export class PostgresDialect extends BaseDialect {
  static dialectName = 'postgres';

  getSequelizeOptions(options: DatabaseOptions) {
    const dialectOptions = options.dialectOptions || {};
    const ssl = (options as any).ssl;

    // Handle SSL configuration
    if (ssl) {
      // Default SSL settings for external Postgres (e.g. AWS/Azure often need strict SSL)
      // We can enhance this to allow custom certificate content if needed in future
      dialectOptions.ssl =
        typeof ssl === 'object'
          ? ssl
          : {
              require: true,
              rejectUnauthorized: false, // Common for self-signed or dev environments, can be refined
            };
    }

    options.dialectOptions = {
      ...dialectOptions,
    };

    return options;
  }
}
