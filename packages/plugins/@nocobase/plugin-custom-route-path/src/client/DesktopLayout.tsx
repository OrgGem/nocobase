/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Desktop Layout Component
 *
 * Renders the admin layout for the custom path by wrapping the existing AdminLayout
 */
import React, { FC } from 'react';
import { AdminLayout } from '@nocobase/client';
import { DesktopProviders } from './DesktopProviders';

export const DesktopLayout: FC = () => {
  return (
    <DesktopProviders>
      <AdminLayout />
    </DesktopProviders>
  );
};

export default DesktopLayout;
