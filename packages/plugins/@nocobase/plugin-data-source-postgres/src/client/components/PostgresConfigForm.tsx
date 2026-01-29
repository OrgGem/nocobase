/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useCallback } from 'react';
import { SchemaComponent, useAPIClient } from '@nocobase/client';
import { useForm } from '@formily/react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';

type CollectionsFieldFactoryResult = {
  CollectionsTable: React.ComponentType<any>;
  createCollectionsSchema: (from?: 'create' | 'edit', loadCollections?: (key: string) => Promise<any>) => any;
  Text: React.ComponentType<any>;
  addAllCollectionsSchema?: any;
};

type CollectionsFieldFactory = (params: { NAMESPACE: string; t: any }) => CollectionsFieldFactoryResult;

type PostgresConfigFormProps = {
  CollectionsTableField: CollectionsFieldFactory;
  loadCollections: (key: string) => Promise<any>;
  from?: 'create' | 'edit';
};

export const PostgresConfigForm: React.FC<PostgresConfigFormProps> = ({
  CollectionsTableField,
  loadCollections,
  from,
}) => {
  console.log('[Postgres Plugin] ConfigForm rendering...');
  const api = useAPIClient();
  const form = useForm();
  const { t } = useTranslation();
  const NAMESPACE = 'data-source-manager';
  const { CollectionsTable, createCollectionsSchema, Text, addAllCollectionsSchema } = CollectionsTableField({
    NAMESPACE,
    t,
  });

  const handleTestConnection = useCallback(async () => {
    await form.submit();
    const values = form.values;

    try {
      await api.request({
        url: 'dataSources:testConnection',
        method: 'post',
        data: values,
      });
      message.success(t('Connection successful'));
    } catch (error: any) {
      const errMessage = error?.response?.data?.errors?.[0]?.message || error?.response?.data?.message || error.message;
      message.error(errMessage);
      return;
    }
  }, [api, form, t]);

  return (
    <SchemaComponent
      scope={{
        CollectionsTableField,
        loadCollections,
        handleTestConnection,
        from,
        t,
        CollectionsTable,
        createCollectionsSchema,
        Text,
        addAllCollectionsSchema,
      }}
      components={{ CollectionsTable, Text }}
      schema={{
        type: 'object',
        properties: {
          type: {
            type: 'string',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            'x-hidden': true,
          },
          key: {
            type: 'string',
            title: t('Data source name'),
            required: true,
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
          displayName: {
            type: 'string',
            title: t('Display name'),
            required: true,
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
          options: {
            type: 'object',
            properties: {
              host: {
                type: 'string',
                title: t('Host'),
                required: true,
                'x-decorator': 'FormItem',
                'x-component': 'Input',
                'x-component-props': {
                  placeholder: 'localhost',
                },
              },
              port: {
                type: 'number',
                title: t('Port'),
                required: true,
                'x-decorator': 'FormItem',
                'x-component': 'InputNumber',
                'x-component-props': {
                  min: 1,
                  max: 65535,
                },
                default: 5432,
              },
              database: {
                type: 'string',
                title: t('Database'),
                required: true,
                'x-decorator': 'FormItem',
                'x-component': 'Input',
              },
              schema: {
                type: 'string',
                title: t('Schema'),
                'x-decorator': 'FormItem',
                'x-component': 'Input',
                default: 'public',
              },
              username: {
                type: 'string',
                title: t('Username'),
                required: true,
                'x-decorator': 'FormItem',
                'x-component': 'Input',
              },
              password: {
                type: 'string',
                title: t('Password'),
                'x-decorator': 'FormItem',
                'x-component': 'Password',
              },
              ssl: {
                type: 'boolean',
                title: t('Enable SSL'),
                'x-decorator': 'FormItem',
                'x-component': 'Checkbox',
                description: t('Establish connection using SSL (Required for most cloud databases)'),
              },
              tablePrefix: {
                type: 'string',
                title: t('Table prefix'),
                'x-decorator': 'FormItem',
                'x-component': 'Input',
              },
              addAllCollections: {
                type: 'boolean',
                title: t('Load all collections'),
                'x-decorator': 'FormItem',
                'x-component': 'Checkbox',
                default: true,
              },
              test: {
                type: 'void',
                'x-decorator': 'FormItem',
                'x-component': 'Button',
                'x-component-props': {
                  onClick: '{{handleTestConnection}}',
                },
                title: t('Test connection'),
              },
              collections: createCollectionsSchema(from, loadCollections),
            },
          },
        },
      }}
    />
  );
};

export default PostgresConfigForm;
