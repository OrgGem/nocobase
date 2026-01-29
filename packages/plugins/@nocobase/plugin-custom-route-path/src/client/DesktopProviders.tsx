/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Desktop Providers Component
 *
 * Provides necessary contexts for desktop app pages
 * Similar to how AdminLayout provides RoutesRequestProvider and other contexts
 */
import React, { FC, createContext, useContext, useMemo, useRef } from 'react';
import {
  CurrentAppInfoProvider,
  ACLRolesCheckProvider,
  RemoteCollectionManagerProvider,
  RemoteSchemaTemplateManagerProvider,
  useRequest,
  useSystemSettings,
  useToken,
  DndContext,
  useMenuDragEnd,
  useDesignable,
  useGlobalTheme,
  PinnedPluginList,
} from '@nocobase/client';
import { useTranslation } from 'react-i18next';
import ProLayout from '@ant-design/pro-layout';
import { css } from '@emotion/css';
import { Link, useLocation } from 'react-router-dom';
import { NocoBaseDesktopRoute } from '@nocobase/client';

// Re-export the route context types from core
export interface DesktopRoutesContextValue {
  allAccessRoutes: NocoBaseDesktopRoute[];
  refresh: () => void;
}

const emptyArray: NocoBaseDesktopRoute[] = [];

const DesktopRoutesContext = createContext<DesktopRoutesContextValue>({
  allAccessRoutes: emptyArray,
  refresh: () => {},
});
DesktopRoutesContext.displayName = 'DesktopRoutesContext';

export const useDesktopRoutes = () => {
  return useContext(DesktopRoutesContext);
};

// Provider that fetches desktop routes
const DesktopRoutesProvider: FC = ({ children }) => {
  const mountedRef = useRef(false);
  const { data, refresh, loading } = useRequest<{
    data: any;
  }>({
    url: `/desktopRoutes:listAccessible`,
    params: { tree: true, sort: 'sort' },
  });

  const value = useMemo(() => {
    return {
      allAccessRoutes: data?.data || emptyArray,
      refresh,
    };
  }, [data?.data, refresh]);

  // Only show loading on first load
  if (loading && !mountedRef.current) {
    return null;
  } else {
    mountedRef.current = true;
  }

  return <DesktopRoutesContext.Provider value={value}>{children}</DesktopRoutesContext.Provider>;
};

export interface DesktopProvidersProps {
  children?: React.ReactNode;
}

export const DesktopProviders: FC<DesktopProvidersProps> = ({ children }) => {
  return (
    <CurrentAppInfoProvider>
      <RemoteSchemaTemplateManagerProvider>
        <RemoteCollectionManagerProvider>
          <ACLRolesCheckProvider>
            <DesktopRoutesProvider>{children}</DesktopRoutesProvider>
          </ACLRolesCheckProvider>
        </RemoteCollectionManagerProvider>
      </RemoteSchemaTemplateManagerProvider>
    </CurrentAppInfoProvider>
  );
};

export default DesktopProviders;
