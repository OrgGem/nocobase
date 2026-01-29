/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// Use file-manager namespace for consistent translations
const NAMESPACE = 'file-manager';

// Cache for blob URLs to avoid re-fetching the same file
const blobUrlCache = new Map<string, string>();

/**
 * S3 Private Storage configuration schema
 * Similar to the standard S3 schema but without baseUrl (since we use proxy)
 */
export default {
  title: `{{t("Amazon S3 (Private)", { ns: "${NAMESPACE}" })}}`,
  name: 's3-private',

  /**
   * Get authenticated URL for file preview (for stream mode)
   * Fetches file via API with authentication and converts to base64 data URL
   * @param options - Contains file metadata, storage config, and API client
   * @returns Base64 data URL that can be used in <img>, <video>, etc.
   */
  async getAuthenticatedUrl(options: {
    file: any; // AttachmentModel
    storage: any; // Storage config with urlMode
    apiClient: any; // NocoBase API client
  }): Promise<string> {
    const { file, storage, apiClient } = options;
    const fileId = file?.id;
    const urlMode = storage?.options?.urlMode || 'presigned';

    // Only process for stream mode
    // Presigned URLs don't need client-side processing
    if (urlMode !== 'stream') {
      return '';
    }

    if (!fileId) {
      return '';
    }

    // Check cache first
    const cacheKey = `s3-private-stream-${fileId}`;
    const cachedUrl = blobUrlCache.get(cacheKey);
    if (cachedUrl) {
      return cachedUrl;
    }

    try {
      // Fetch file with authentication via API client
      const response = await apiClient.request({
        url: '/api/attachments:stream',
        method: 'get',
        params: {
          filterByTk: fileId,
          mode: 'inline',
        },
        responseType: 'arraybuffer', // Get binary data for base64 conversion
        // API client automatically includes Authorization header
      });

      // Get content type from response headers
      const contentType = response.headers['content-type'] || file.mimetype || 'application/octet-stream';

      // Convert arraybuffer to base64
      const base64 = btoa(new Uint8Array(response.data).reduce((data, byte) => data + String.fromCharCode(byte), ''));

      // Create data URL
      const dataUrl = `data:${contentType};base64,${base64}`;

      // Cache the data URL
      blobUrlCache.set(cacheKey, dataUrl);

      // Optional: Cleanup cache after 5 minutes
      setTimeout(
        () => {
          if (blobUrlCache.has(cacheKey)) {
            blobUrlCache.delete(cacheKey);
          }
        },
        5 * 60 * 1000,
      );

      return dataUrl;
    } catch (error) {
      console.error('[S3 Private Storage] Failed to fetch authenticated stream URL:', error);
      // Fallback to direct URL (may fail with 401, but better than nothing)
      return `/api/attachments:stream?filterByTk=${fileId}&mode=inline`;
    }
  },

  fieldset: {
    title: {
      'x-component': 'CollectionField',
      'x-decorator': 'FormItem',
    },
    name: {
      'x-component': 'CollectionField',
      'x-decorator': 'FormItem',
      'x-disabled': '{{ !createOnly }}',
      required: true,
      default: '{{ useNewId("s_") }}',
      description:
        '{{t("Randomly generated and can be modified. Support letters, numbers and underscores, must start with an letter.")}}',
    },
    options: {
      type: 'object',
      'x-component': 'fieldset',
      properties: {
        region: {
          title: `{{t("Region", { ns: "${NAMESPACE}" })}}`,
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'TextAreaWithGlobalScope',
          required: true,
        },
        accessKeyId: {
          title: `{{t("AccessKey ID", { ns: "${NAMESPACE}" })}}`,
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'TextAreaWithGlobalScope',
          description: `{{t("Optional. Leave empty to use IAM role or AWS credential chain.", { ns: "${NAMESPACE}" })}}`,
        },
        secretAccessKey: {
          title: `{{t("AccessKey Secret", { ns: "${NAMESPACE}" })}}`,
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'TextAreaWithGlobalScope',
          'x-component-props': { password: true },
          description: `{{t("Optional. Leave empty to use IAM role or AWS credential chain.", { ns: "${NAMESPACE}" })}}`,
        },
        bucket: {
          title: `{{t("Bucket", { ns: "${NAMESPACE}" })}}`,
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'TextAreaWithGlobalScope',
          required: true,
        },
        endpoint: {
          title: `{{t("Endpoint", { ns: "${NAMESPACE}" })}}`,
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'TextAreaWithGlobalScope',
          description: `{{t("Optional. Custom endpoint for S3-compatible services (e.g., MinIO).", { ns: "${NAMESPACE}" })}}`,
        },
        urlMode: {
          title: `{{t("URL Mode", { ns: "${NAMESPACE}" })}}`,
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: `{{t("Presigned URL (Recommended)", { ns: "${NAMESPACE}" })}}`, value: 'presigned' },
            { label: `{{t("Authenticated Stream (More Secure)", { ns: "${NAMESPACE}" })}}`, value: 'stream' },
          ],
          default: 'presigned',
          description: `{{t("Presigned URLs are faster but shareable for 1 hour. Authenticated streams require login but are more secure.", { ns: "${NAMESPACE}" })}}`,
        },
      },
    },
    path: {
      'x-component': 'CollectionField',
      'x-decorator': 'FormItem',
      description: `{{t('Relative path the file will be saved to. Left blank as root path. The leading and trailing slashes "/" will be ignored. For example: "user/avatar".', { ns: "${NAMESPACE}" })}}`,
    },
    rules: {
      type: 'object',
      'x-component': 'fieldset',
      properties: {
        size: {
          type: 'number',
          title: `{{t("File size limit", { ns: "${NAMESPACE}" })}}`,
          description: `{{t("Minimum from 1 byte.", { ns: "${NAMESPACE}" })}}`,
          'x-decorator': 'FormItem',
          'x-component': 'FileSizeField',
          required: true,
          default: 1024 * 1024 * 20, // 20MB default
        },
        mimetype: {
          type: 'string',
          title: `{{t("File type (in MIME type format)", { ns: "${NAMESPACE}" })}}`,
          description: `{{t('Multi-types seperated with comma, for example: "image/*", "image/png", "image/*, application/pdf" etc.', { ns: "${NAMESPACE}" })}}`,
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          'x-component-props': {
            placeholder: '*',
          },
        },
      },
    },
    default: {
      'x-component': 'CollectionField',
      'x-decorator': 'FormItem',
      'x-content': `{{t("Default storage", { ns: "${NAMESPACE}" })}}`,
    },
    paranoid: {
      'x-component': 'CollectionField',
      'x-decorator': 'FormItem',
      'x-content': `{{t("Keep file in storage when destroy the file record", { ns: "${NAMESPACE}" })}}`,
    },
  },
};
