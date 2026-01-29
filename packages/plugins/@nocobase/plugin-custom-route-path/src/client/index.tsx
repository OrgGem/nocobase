/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Plugin Custom Route Path - Client Entry
 *
 * Creates an isolated router for desktop app at custom path (e.g., /app)
 * following the architecture pattern from plugin-mobile.
 *
 * Key architecture:
 * - Creates separate RouterManager with custom basename
 * - Registers single entry route in main app router
 * - Does NOT override any /admin routes
 */
import { PagePopups, Plugin, RouterManager, createRouterManager } from '@nocobase/client';
import React from 'react';
import { Outlet } from 'react-router-dom';
import { BASIC_PATH, CUSTOM_PATH_ENABLED as CONFIG_ENABLED } from './config';
import { lang as t, NAMESPACE } from './locale';
import { CustomRouteSettings } from './Settings';
import { DesktopApp } from './DesktopApp';
import { DesktopLayout } from './DesktopLayout';
import { DesktopDynamicPage } from './DesktopDynamicPage';
import { PageTabs } from '@nocobase/client';

// Helper to get custom path from config/localStorage
const getCustomPath = () => {
  const storagePath = localStorage.getItem('NOCOBASE_CUSTOM_ROUTE_PATH');
  const storageEnabled = localStorage.getItem('NOCOBASE_CUSTOM_ROUTE_ENABLED') === 'true';
  let path = BASIC_PATH;
  let enabled = CONFIG_ENABLED;
  if (storagePath) {
    path = storagePath;
    enabled = storageEnabled;
  }
  if (!enabled || (path as string) === '/admin') {
    return null;
  }
  return path;
};

export class PluginCustomRoutePathClient extends Plugin {
  desktopRouter?: RouterManager;
  customPath: string | null = null;

  get desktopBasename() {
    const path = this.customPath || '/app';
    // Remove leading slash for basename construction
    const pathWithoutSlash = path.startsWith('/') ? path.slice(1) : path;
    return `${this.router.getBasename()}${pathWithoutSlash}`;
  }

  async afterAdd(): Promise<void> {
    this.customPath = getCustomPath();
    if (this.customPath) {
      this.setDesktopRouter();
    }
  }

  async load() {
    // Register Settings Page (always under /admin/settings)
    this.app.pluginSettingsManager.add(NAMESPACE, {
      title: t('Custom Route Path'),
      icon: 'LinkOutlined',
      Component: CustomRouteSettings,
    });

    // If no custom path configured, do nothing
    if (!this.customPath) {
      console.log('[PluginCustomRoutePath] Custom path disabled or set to /admin');
      return;
    }

    console.log(`[PluginCustomRoutePath] Registering desktop app at: ${this.customPath}`);

    // Register components
    this.addComponents();

    // Add routes to the isolated desktop router
    this.addDesktopRoutes();

    // Register entry route in main app router
    this.addAppRoutes();
  }

  /**
   * Create a separate RouterManager for desktop app
   * (Similar to how mobile plugin creates mobileRouter)
   */
  setDesktopRouter() {
    const router = createRouterManager(
      this.options?.config?.router || { type: 'browser', basename: this.desktopBasename },
      this.app,
    );
    this.desktopRouter = router;
  }

  /**
   * Add routes to the isolated desktop router
   */
  addDesktopRoutes() {
    if (!this.desktopRouter) return;

    this.desktopRouter.add('desktop', {
      Component: 'DesktopLayout',
    });

    this.desktopRouter.add('desktop.home', {
      path: '/',
      Component: 'DesktopDynamicPage',
    });

    this.desktopRouter.add('desktop.page', {
      path: '/:name',
      Component: 'DesktopDynamicPage',
    });

    this.desktopRouter.add('desktop.page.tab', {
      path: '/:name/tabs/:tabUid',
      Component: PageTabs as any,
    });

    this.desktopRouter.add('desktop.page.popup', {
      path: '/:name/popups/*',
      Component: PagePopups,
    });

    this.desktopRouter.add('desktop.page.tab.popup', {
      path: '/:name/tabs/:tabUid/popups/*',
      Component: PagePopups,
    });
  }

  /**
   * Register entry route in main app router
   * (Single entry point, similar to mobile's /m/*)
   */
  addAppRoutes() {
    this.app.addComponents({ DesktopApp });
    this.app.router.add('desktop-app', {
      path: `${this.customPath}/*`,
      Component: 'DesktopApp',
    });
  }

  addComponents() {
    this.app.addComponents({
      DesktopLayout,
      DesktopDynamicPage,
    });
  }

  /**
   * Get the router component for rendering
   */
  getRouterComponent() {
    return this.desktopRouter?.getRouterComponent() || (() => null);
  }
}

export default PluginCustomRoutePathClient;
