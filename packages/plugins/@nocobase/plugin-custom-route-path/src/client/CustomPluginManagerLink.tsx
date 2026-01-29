/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { ApiOutlined, SettingOutlined } from '@ant-design/icons';
import { SchemaComponent, useApp, useCompile, useToken } from '@nocobase/client';
import { Button, Dropdown, Tooltip } from 'antd';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { BASIC_PATH, CUSTOM_PATH_ENABLED } from './config';

// Helper to get current path
const useCurrentBasePath = () => {
  const storagePath = localStorage.getItem('NOCOBASE_CUSTOM_ROUTE_PATH');
  const storageEnabled = localStorage.getItem('NOCOBASE_CUSTOM_ROUTE_ENABLED') === 'true';
  let path = BASIC_PATH;
  let enabled = CUSTOM_PATH_ENABLED;
  if (storagePath) {
    path = storagePath;
    enabled = storageEnabled;
  }
  if (!enabled || path === '/admin') {
    return '/admin';
  }
  return path;
};

export const CustomPluginManagerLink = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useToken();
  const path = useCurrentBasePath();

  return (
    <Tooltip title={t('Plugin manager')}>
      <Button
        data-testid={'plugin-manager-button'}
        icon={<ApiOutlined style={{ color: token.colorTextHeaderMenu }} />}
        title={t('Plugin manager')}
        onClick={() => {
          navigate(`${path}/pm/list`);
        }}
      />
    </Tooltip>
  );
};

export const CustomSettingsCenterDropdown = () => {
  const compile = useCompile();
  const { t } = useTranslation();
  const { token } = useToken();
  const app = useApp();
  // Ensure we use the dynamic path for cache clearing key if needed, or just rely on manager

  const settingItems = useMemo(() => {
    // We force a refresh of the list if possible, or assume clearCache in logic did its job
    const settings = app.pluginSettingsManager.getList();
    return settings
      .filter((v) => v.isTopLevel !== false)
      .map((setting) => {
        return {
          key: setting.name,
          icon: setting.icon,
          label: setting.link ? (
            <div onClick={() => window.open(setting.link)}>{compile(setting.title)}</div>
          ) : (
            <Link to={setting.path}>{compile(setting.title)}</Link>
          ),
        };
      });
  }, [app, t, compile]); // Dependencies might need to include something that signals path change?

  useEffect(() => {
    return () => {
      app.pluginSettingsManager.clearCache();
    };
  }, [app.pluginSettingsManager]);

  return (
    <Dropdown
      menu={{
        style: {
          maxHeight: '70vh',
          overflow: 'auto',
        },
        items: settingItems,
      }}
    >
      <Button
        data-testid="plugin-settings-button"
        icon={<SettingOutlined style={{ color: token.colorTextHeaderMenu }} />}
        title={t('All plugin settings')}
      />
    </Dropdown>
  );
};
