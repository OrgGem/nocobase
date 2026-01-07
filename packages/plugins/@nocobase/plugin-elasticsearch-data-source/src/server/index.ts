/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/server';
import { ElasticsearchCollectionManager } from './collection-manager';
import { ElasticsearchDataSource } from './data-source';
import { ElasticsearchRepository } from './repository';

export class PluginElasticsearchDataSourceServer extends Plugin {
  async beforeLoad() {
    this.app.dataSourceManager.registerDataSourceType('elasticsearch', ElasticsearchDataSource);
  }
}

export default PluginElasticsearchDataSourceServer;
export { ElasticsearchDataSource, ElasticsearchCollectionManager, ElasticsearchRepository };
