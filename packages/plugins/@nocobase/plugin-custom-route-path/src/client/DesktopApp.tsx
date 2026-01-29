/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Desktop App Entry Component
 *
 * Similar to Mobile.tsx - wraps the desktop router with necessary providers
 */
import React from 'react';
import {
  AdminProvider,
  AntdAppProvider,
  GlobalThemeProvider,
  usePlugin,
  AllDataBlocksProvider,
  zIndexContext,
} from '@nocobase/client';
import { theme } from 'antd';
import { PluginCustomRoutePathClient } from './index';

export const DesktopApp = () => {
  const plugin = usePlugin(PluginCustomRoutePathClient);
  const DesktopRouter = plugin.getRouterComponent();
  const AdminProviderComponent = plugin?.options?.config?.skipLogin ? React.Fragment : AdminProvider;

  return (
    <AdminProviderComponent>
      <GlobalThemeProvider
        theme={{
          algorithm: theme.defaultAlgorithm,
        }}
      >
        <AntdAppProvider className="desktop-app-container">
          {/* the z-index of all popups and subpages will be based on this value */}
          <zIndexContext.Provider value={100}>
            <AllDataBlocksProvider>
              <DesktopRouter />
            </AllDataBlocksProvider>
          </zIndexContext.Provider>
        </AntdAppProvider>
      </GlobalThemeProvider>
    </AdminProviderComponent>
  );
};

export default DesktopApp;
