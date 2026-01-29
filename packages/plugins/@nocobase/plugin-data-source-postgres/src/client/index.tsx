/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';
import React from 'react';
import { PluginDataSourceManagerClient } from '@nocobase/plugin-data-source-manager/client';
import { useLocation } from 'react-router-dom';
import { PostgresConfigForm } from './components/PostgresConfigForm';
import { PostgresDeleteCollection } from './components/PostgresDeleteCollection';
import { PostgresCollectionManager } from './components/CollectionManager';

export class PluginDataSourcePostgresClient extends Plugin {
  async load() {
    let plugin = this.app.pm.get(PluginDataSourceManagerClient);

    if (!plugin) {
      console.warn(
        '[Postgres Plugin] PluginDataSourceManagerClient class lookup failed. Trying by name "data-source-manager"',
      );
      plugin = this.app.pm.get('data-source-manager');
    }

    if (!plugin) {
      console.warn('[Postgres Plugin] "data-source-manager" lookup failed. Trying full package name.');
      plugin = this.app.pm.get('@nocobase/plugin-data-source-manager');
    }

    if (!plugin) {
      console.error(
        '[Postgres Plugin] Failed to find data-source-manager plugin instance. Postgres settings will not work.',
      );
      return;
    }

    plugin.registerType('postgres', {
      label: 'PostgreSQL',
      icon: 'DatabaseOutlined',
      color: 'blue',
      DataSourceSettingsForm: PostgresConfigForm,
      DeleteCollection: PostgresDeleteCollection,
      disableAddFields: false,
      disableTestConnection: false,
      allowCollectionDeletion: true,
    });

    // Runtime patch to replace the CollectionManager page for Postgres
    const settingsItem = this.app.pluginSettingsManager.get('data-source-manager/:name.collections');
    if (settingsItem && settingsItem.Component) {
      const OriginalComponent = settingsItem.Component;
      const PostgresSettingsOverride = (props) => {
        const location = useLocation();
        const search = new URLSearchParams(location.search);
        const type = search.get('type');

        if (type === 'postgres') {
          return <PostgresCollectionManager {...props} />;
        }

        return <OriginalComponent {...props} />;
      };
      settingsItem.Component = PostgresSettingsOverride;
    }
  }
}

export default PluginDataSourcePostgresClient;
