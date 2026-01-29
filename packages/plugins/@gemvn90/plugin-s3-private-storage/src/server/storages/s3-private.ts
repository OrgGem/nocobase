/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import Path from 'path';
import { Readable } from 'stream';
import { StorageEngine } from 'multer';
import { AttachmentModel, StorageModel, StorageType } from '@nocobase/plugin-file-manager';
import { STORAGE_TYPE_S3_PRIVATE } from '../../constants';

export default class S3PrivateStorage extends StorageType {
  static filenameKey = 'key';

  static defaults(): StorageModel {
    return {
      title: 'AWS S3 (Private)',
      name: 'aws-s3-private',
      type: STORAGE_TYPE_S3_PRIVATE,
      baseUrl: '', // Not used for private storage since we use proxy
      options: {
        region: process.env.AWS_S3_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        bucket: process.env.AWS_S3_BUCKET,
      },
    };
  }

  private getS3Client(): S3Client {
    const { accessKeyId, secretAccessKey, region, endpoint, ...otherOptions } = this.storage.options;
    const clientConfig: any = {
      region,
      ...otherOptions,
    };

    // Only set credentials if both accessKeyId and secretAccessKey are provided
    // Otherwise, AWS SDK will use default credential chain (IAM role, env vars, etc.)
    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }

    if (endpoint) {
      clientConfig.endpoint = endpoint;
      clientConfig.forcePathStyle = true;
    }

    return new S3Client(clientConfig);
  }

  /**
   * Create multer storage engine for S3 uploads
   */
  make(): StorageEngine {
    const multerS3 = require('multer-s3');
    const { accessKeyId, secretAccessKey, bucket, acl = 'private', ...options } = this.storage.options;

    if (options.endpoint) {
      options.forcePathStyle = true;
    } else {
      options.endpoint = undefined;
    }

    const s3ClientConfig: any = {
      ...options,
    };

    // Only set credentials if both are provided
    if (accessKeyId && secretAccessKey) {
      s3ClientConfig.credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }

    const s3 = new S3Client(s3ClientConfig);

    return multerS3({
      s3,
      bucket,
      acl,
      contentType(req, file, cb) {
        if (file.mimetype) {
          cb(null, file.mimetype);
          return;
        }
        multerS3.AUTO_CONTENT_TYPE(req, file, cb);
      },
      key: (req, file, cb) => {
        const ext = Path.extname(file.originalname);
        const filename = `${crypto.randomUUID()}${ext}`;
        const path = (this.storage.path || '').replace(/^\/|\/$/g, '');
        cb(null, path ? `${path}/${filename}` : filename);
      },
    });
  }

  /**
   * Delete files from S3
   */
  async delete(records: AttachmentModel[]): Promise<[number, AttachmentModel[]]> {
    const s3 = this.getS3Client();
    const bucket = this.storage.options.bucket;
    const deleted: { Key: string }[] = [];

    for (const record of records) {
      const key = this.getFileKey(record);
      const deleteCommand = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      await s3.send(deleteCommand);
      deleted.push({ Key: key });
    }

    return [deleted.length, records.filter((record) => !deleted.find((item) => item.Key === this.getFileKey(record)))];
  }

  /**
   * Get file stream directly from S3 using credentials
   * This bypasses public URLs and works with private buckets
   */
  async getFileStream(file: AttachmentModel): Promise<{ stream: Readable; contentType?: string }> {
    const s3 = this.getS3Client();
    const command = new GetObjectCommand({
      Bucket: this.storage.options.bucket,
      Key: this.getFileKey(file),
    });

    const response = await s3.send(command);

    if (!response.Body) {
      throw new Error(`Failed to get file stream for: ${this.getFileKey(file)}`);
    }

    return {
      stream: response.Body as Readable,
      contentType: response.ContentType,
    };
  }

  /**
   * Override getFileURL to return URL based on urlMode configuration.
   * - 'presigned': S3 presigned URL with embedded signature (fast, 1-hour valid, shareable)
   * - 'stream': Authenticated stream endpoint (secure, requires bearer token)
   */
  async getFileURL(file: AttachmentModel, preview?: boolean): Promise<string> {
    const fileKey = this.getFileKey(file);
    const fileId = (file as any).id;
    const urlMode = this.storage.options.urlMode || 'presigned';

    if (!fileKey && !fileId) {
      return '';
    }

    // Mode 1: Authenticated Stream (bearer token required)
    if (urlMode === 'stream') {
      if (!fileId) {
        return '';
      }
      const mode = preview ? 'inline' : 'attachment';
      return `/api/attachments:stream?filterByTk=${fileId}&mode=${mode}`;
    }

    // Mode 2: Presigned URL (default, recommended)
    if (!fileKey) {
      return '';
    }

    try {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const { GetObjectCommand } = require('@aws-sdk/client-s3');

      const s3 = this.getS3Client();
      const command = new GetObjectCommand({
        Bucket: this.storage.options.bucket,
        Key: fileKey,
        ResponseContentDisposition: preview
          ? `inline; filename="${encodeURIComponent((file as any).filename || 'file')}"`
          : `attachment; filename="${encodeURIComponent((file as any).filename || 'file')}"`,
      });

      // Generate presigned URL with 1 hour expiration
      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

      return signedUrl;
    } catch (error) {
      console.error('[S3 Private Storage] Failed to generate presigned URL:', error);
      // Fallback to stream endpoint
      return fileId ? `/api/attachments:stream?filterByTk=${fileId}&mode=inline` : '';
    }
  }
}
