/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';
import { ISchema, SchemaComponent } from '@nocobase/client';
import Plugin from '@nocobase/plugin-data-source-manager/client';
import { Plugin as ClientPlugin, useTranslation } from '@nocobase/client';

const NAMESPACE = 'data-source-manager';

type DataSourceSettingsFormProps = {
  CollectionsTableField: any;
  loadCollections: (key: string) => Promise<any>;
  from: 'create' | 'edit';
};

const ElasticsearchDataSourceSettingsForm: React.FC<DataSourceSettingsFormProps> = ({
  CollectionsTableField,
  loadCollections,
  from,
}) => {
  const { t } = useTranslation();
  const { CollectionsTable, createCollectionsSchema, Text, addAllCollectionsSchema } = CollectionsTableField({
    NAMESPACE,
    t,
  });

  const schema: ISchema = {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        'x-decorator': 'FormItem',
        'x-component': 'Input',
        'x-component-props': {
          placeholder: t('Unique key', { ns: NAMESPACE }),
          disabled: from === 'edit',
        },
        required: true,
        title: t('Data source name', { ns: NAMESPACE }),
      },
      displayName: {
        type: 'string',
        'x-decorator': 'FormItem',
        'x-component': 'Input',
        required: true,
        title: t('Data source display name', { ns: NAMESPACE }),
      },
      type: {
        type: 'string',
        'x-decorator': 'FormItem',
        'x-component': 'Input',
        'x-display': 'hidden',
      },
      options: {
        type: 'object',
        title: t('Connection', { ns: NAMESPACE }),
        'x-decorator': 'FormItem',
        'x-component': 'CardItem',
        properties: {
          host: {
            type: 'string',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            required: true,
            title: t('Host', { ns: NAMESPACE }),
            'x-component-props': {
              placeholder: 'https://example.com:9200',
            },
          },
          username: {
            type: 'string',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            title: t('Username', { ns: NAMESPACE }),
          },
          password: {
            type: 'string',
            'x-decorator': 'FormItem',
            'x-component': 'Password',
            title: t('Password', { ns: NAMESPACE }),
          },
        },
      },
      addAllCollections: {
        ...addAllCollectionsSchema,
        title: t('Import all collections', { ns: NAMESPACE }),
        'x-decorator': 'FormItem',
        default: true,
        'x-component-props': {
          defaultChecked: true,
        },
        'x-reactions': [
          {
            fulfill: {
              run: '$form.setValuesIn("options.addAllCollections", $self.value)',
            },
          },
        ],
      },
      collections: createCollectionsSchema(from, loadCollections),
    },
  };

  return (
    <SchemaComponent
      schema={schema}
      scope={{
        from,
      }}
      components={{
        Text,
        CollectionsTable,
      }}
    />
  );
};

export class PluginElasticsearchDataSourceClient extends ClientPlugin {
  async load() {
    const manager = this.app.pm.get(Plugin);
    manager.registerType('elasticsearch', {
      name: 'elasticsearch',
      label: '{{t("Elasticsearch")}}',
      color: 'gold',
      allowCollectionCreate: true,
      allowCollectionDeletion: true,
      DataSourceSettingsForm: ElasticsearchDataSourceSettingsForm,
    });
  }
}

export default PluginElasticsearchDataSourceClient;
