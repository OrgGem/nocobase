/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { css } from '@emotion/css';
import { createForm } from '@formily/core';
import { FormProvider, useForm } from '@formily/react';
import { SchemaComponent } from '@nocobase/client';
import { App, Button, Form, Input, Alert } from 'antd';
import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NAMESPACE } from './locale';

const SubmitButton = (props) => {
  const { t } = useTranslation(NAMESPACE);
  const form = useForm();
  const { useSaveSettings } = props;
  const saveAction = useSaveSettings();

  return (
    <Button
      type="primary"
      onClick={() => {
        form.submit(saveAction.run);
      }}
    >
      {t('Submit')}
    </Button>
  );
};

const CustomPathLink = () => {
  const { t } = useTranslation(NAMESPACE);
  const [path, setPath] = useState(localStorage.getItem('NOCOBASE_CUSTOM_ROUTE_PATH'));
  const enabled = localStorage.getItem('NOCOBASE_CUSTOM_ROUTE_ENABLED') === 'true';

  // Listen for custom event to update link immediately
  useEffect(() => {
    const handlePathChange = () => {
      setPath(localStorage.getItem('NOCOBASE_CUSTOM_ROUTE_PATH'));
    };
    window.addEventListener('customRoutePathChanged', handlePathChange);
    return () => window.removeEventListener('customRoutePathChanged', handlePathChange);
  }, []);

  if (!enabled || !path || path === '/admin') return null;

  return (
    <Alert
      message={t('Desktop App Active')}
      description={
        <div>
          <p>
            {t('Your desktop application is accessible at:')}{' '}
            <strong>
              <a href={path} target="_blank" rel="noreferrer">
                {window.location.origin}
                {path}
              </a>
            </strong>
          </p>
          <p style={{ fontSize: '0.9em', color: '#666' }}>
            {t('Note: The standard /admin routes remain active for system administration.')}
          </p>
        </div>
      }
      type="success"
      showIcon
      style={{ marginBottom: 24 }}
    />
  );
};

const schema = {
  type: 'object',
  properties: {
    info: {
      type: 'void',
      'x-component': 'CustomPathLink',
    },
    basePath: {
      type: 'string',
      title: '{{t("Desktop App Base Path")}}',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      'x-component-props': {
        placeholder: '/app',
      },
      description:
        '{{t("The custom path for the desktop application (e.g., /app). The standard /admin path will remain accessible. Changing this will require a page reload.")}}',
      default: '/app',
    },
    save: {
      type: 'void',
      'x-component': 'SubmitButton',
      'x-component-props': {
        useSaveSettings: '{{ useSaveSettings }}',
      },
    },
  },
};

const useSaveSettings = () => {
  const { message } = App.useApp();
  const { t } = useTranslation(NAMESPACE);
  const form = useForm();

  return {
    async run() {
      const values = form.values;
      const path = values.basePath;

      // Basic validation
      if (path && !path.startsWith('/')) {
        message.error(t('Path must start with /'));
        return;
      }

      if (!path || path === '/admin') {
        localStorage.removeItem('NOCOBASE_CUSTOM_ROUTE_PATH');
        localStorage.setItem('NOCOBASE_CUSTOM_ROUTE_ENABLED', 'false');
      } else {
        localStorage.setItem('NOCOBASE_CUSTOM_ROUTE_PATH', path);
        localStorage.setItem('NOCOBASE_CUSTOM_ROUTE_ENABLED', 'true');
      }

      // Dispatch custom event to notify other components (same-tab updates)
      window.dispatchEvent(new CustomEvent('customRoutePathChanged'));

      message.success(t('Saved successfully. Please reload the page to apply changes.'));

      // Optional: Reload page after short delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    },
  };
};

export const CustomRouteSettings = () => {
  const { t } = useTranslation(NAMESPACE);
  const initialPath = localStorage.getItem('NOCOBASE_CUSTOM_ROUTE_PATH') || '/app';

  const form = useMemo(
    () =>
      createForm({
        initialValues: {
          basePath: initialPath,
        },
      }),
    [initialPath],
  );

  const scope = useMemo(
    () => ({
      useSaveSettings,
    }),
    [],
  );

  return (
    <div
      className={css`
        padding: 24px;
        max-width: 600px;
      `}
    >
      <FormProvider form={form}>
        <SchemaComponent
          schema={schema}
          scope={scope}
          components={{
            Input,
            FormItem: Form.Item,
            SubmitButton,
            CustomPathLink,
          }}
        />
      </FormProvider>
    </div>
  );
};
