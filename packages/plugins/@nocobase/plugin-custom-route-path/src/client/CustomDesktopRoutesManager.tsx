/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/* eslint-disable react-hooks/rules-of-hooks */
import {
  ExtendCollectionsProvider,
  ISchema,
  SchemaComponent,
  SchemaComponentContext,
  useSchemaComponentContext,
} from '@nocobase/client';
import { Card } from 'antd';
import React, { FC, useMemo, useState, useEffect } from 'react';
import desktopRoutes from './collections/desktopRoutes';
import { createRoutesTableSchema } from './routesTableSchema';
import { useTranslation } from 'react-i18next';

// Get custom path dynamically from localStorage
const getCustomPath = () => {
  const storagePath = localStorage.getItem('NOCOBASE_CUSTOM_ROUTE_PATH');
  const storageEnabled = localStorage.getItem('NOCOBASE_CUSTOM_ROUTE_ENABLED') === 'true';
  if (storageEnabled && storagePath && storagePath !== '/admin') {
    return storagePath;
  }
  return '/admin';
};

export const CustomDesktopRoutesManager: FC = () => {
  const { t } = useTranslation();
  const scCtx = useSchemaComponentContext();
  const schemaComponentContext = useMemo(() => ({ ...scCtx, designable: false }), [scCtx]);

  // Use state to track custom path reactively
  const [adminPath, setAdminPath] = useState(getCustomPath);

  // Listen for localStorage changes (from other tabs or custom events)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'NOCOBASE_CUSTOM_ROUTE_PATH' || e.key === 'NOCOBASE_CUSTOM_ROUTE_ENABLED') {
        setAdminPath(getCustomPath());
      }
    };

    // Also listen for custom event (for same-tab updates)
    const handleCustomPathChange = () => {
      setAdminPath(getCustomPath());
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('customRoutePathChanged', handleCustomPathChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('customRoutePathChanged', handleCustomPathChange);
    };
  }, []);

  // Recreate schema when path changes
  const routesSchema: ISchema = useMemo(() => createRoutesTableSchema('desktopRoutes', adminPath), [adminPath]);

  return (
    <ExtendCollectionsProvider collections={[desktopRoutes]}>
      <SchemaComponentContext.Provider value={schemaComponentContext}>
        <Card bordered={false}>
          <SchemaComponent
            schema={routesSchema}
            scope={{
              t,
            }}
          />
        </Card>
      </SchemaComponentContext.Provider>
    </ExtendCollectionsProvider>
  );
};
