/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Desktop Dynamic Page Component
 *
 * Renders the page schema based on the current route
 * Similar to AdminDynamicPage but for the custom path router
 */
import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { RemoteSchemaComponent, useRequest } from '@nocobase/client';
import { Spin, Result } from 'antd';
import { useDesktopRoutes } from './DesktopProviders';
import { HighlightOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

// Find route by schemaUid (page name)
const findRouteByName = (name: string | undefined, routes: any[]): any => {
  if (!name) return null;
  for (const route of routes) {
    if (route.schemaUid === name) {
      return route;
    }
    if (route.children) {
      const found = findRouteByName(name, route.children);
      if (found) return found;
    }
  }
  return null;
};

// Check if route is a group (should not render schema)
const isGroup = (name: string | undefined, routes: any[]): boolean => {
  if (!name) return false;
  const route = findRouteByName(name, routes);
  return route?.type === 'group';
};

// Get first accessible page for home redirect
const getFirstAccessiblePage = (routes: any[]): string | null => {
  for (const route of routes) {
    if (route.type === 'page' && route.schemaUid) {
      return route.schemaUid;
    }
    if (route.children) {
      const found = getFirstAccessiblePage(route.children);
      if (found) return found;
    }
  }
  return null;
};

export const DesktopDynamicPage = () => {
  const { name } = useParams<{ name: string }>();
  const { allAccessRoutes } = useDesktopRoutes();
  const { t } = useTranslation();

  // If no page name, try to get first accessible page
  const currentPageUid = useMemo(() => {
    if (name) return name;
    return getFirstAccessiblePage(allAccessRoutes);
  }, [name, allAccessRoutes]);

  // Group page should not request schema data
  if (isGroup(currentPageUid, allAccessRoutes)) {
    return null;
  }

  // Show empty state when no pages
  if (!currentPageUid && allAccessRoutes.length === 0) {
    return (
      <Result
        icon={<HighlightOutlined style={{ fontSize: '8em' }} />}
        title={t('No pages yet, please configure first')}
        subTitle={t('Click the "UI Editor" icon in the upper right corner to enter the UI Editor mode')}
      />
    );
  }

  // 404 if page not found
  if (currentPageUid && !findRouteByName(currentPageUid, allAccessRoutes)) {
    return <Result status="404" title="404" subTitle={t('Page not found')} />;
  }

  if (!currentPageUid) {
    return null;
  }

  return <RemoteSchemaComponent uid={currentPageUid} />;
};

export default DesktopDynamicPage;
