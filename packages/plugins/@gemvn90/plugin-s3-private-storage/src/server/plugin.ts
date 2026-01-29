/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context } from '@nocobase/actions';
import { Plugin } from '@nocobase/server';
import PluginFileManagerServer from '@nocobase/plugin-file-manager';
import { STORAGE_TYPE_S3_PRIVATE } from '../constants';
import S3PrivateStorage from './storages/s3-private';

export class PluginS3PrivateStorageServer extends Plugin {
  async afterAdd() {
    // Ensure file-manager plugin loads before this plugin
    this.app.pm.get(PluginFileManagerServer);
  }

  async load() {
    // Register the new storage type with file-manager plugin
    const fileManagerPlugin = this.app.pm.get(PluginFileManagerServer) as PluginFileManagerServer;
    fileManagerPlugin.registerStorageType(STORAGE_TYPE_S3_PRIVATE, S3PrivateStorage);

    // Register the stream action for attachments
    this.app.resourceManager.registerActionHandler('attachments:stream', this.streamAction.bind(this));

    // Allow logged-in users to access the stream action
    // More granular ACL can be configured by the user
    this.app.acl.allow('attachments', 'stream', 'loggedIn');
  }

  /**
   * Stream action handler - serves files from private S3 storage
   * Supports both inline (preview) and attachment (download) modes
   */
  private async streamAction(ctx: Context) {
    const { filterByTk, mode = 'inline' } = ctx.action.params;

    if (!filterByTk) {
      ctx.throw(400, 'Missing filterByTk parameter');
      return;
    }

    // Get the attachment record
    const repository = ctx.db.getRepository('attachments');
    const record = await repository.findOne({
      filterByTk,
    });

    if (!record) {
      ctx.throw(404, 'Attachment not found');
      return;
    }

    // Get file-manager plugin to access getFileStream
    const fileManagerPlugin = this.app.pm.get(PluginFileManagerServer) as PluginFileManagerServer;

    try {
      const { stream, contentType } = await fileManagerPlugin.getFileStream(record);

      // Set response headers
      ctx.set('Content-Type', contentType || 'application/octet-stream');

      // Set Content-Disposition based on mode
      const filename = encodeURIComponent(record.get('filename') || 'file');
      if (mode === 'attachment') {
        ctx.set('Content-Disposition', `attachment; filename="${filename}"`);
      } else {
        ctx.set('Content-Disposition', `inline; filename="${filename}"`);
      }

      // Set caching headers
      ctx.set('Cache-Control', 'private, max-age=3600');

      // Stream the file to client
      ctx.body = stream;
    } catch (error) {
      ctx.logger.error('[s3-private-storage] Stream error:', error);
      ctx.throw(500, 'Failed to stream file');
    }
  }
}

export default PluginS3PrivateStorageServer;
