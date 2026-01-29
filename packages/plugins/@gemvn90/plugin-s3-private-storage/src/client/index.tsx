/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// @ts-ignore
import { Plugin, attachmentFileTypes } from '@nocobase/client';
import PluginFileManagerClient from '@nocobase/plugin-file-manager/client';
import React from 'react';
import { STORAGE_TYPE_S3_PRIVATE } from '../constants';
import s3PrivateStorageType from './schemas/s3-private';
import {
  S3PrivatePreview,
  AuthenticatedImage,
  AuthenticatedVideo,
  AuthenticatedAudio,
  useAuthenticatedDownload,
  mountPreview,
} from './S3PrivatePreview';

export class PluginS3PrivateStorageClient extends Plugin {
  async load() {
    console.log('[S3 Private] Plugin loading...');

    // Global Preview Container to handle imperative preview calls
    // This solves the issue where Detail view clicks trigger download instead of preview
    // We listen for 's3-private-preview' event and show the modal
    const GlobalPreviewContainer = (props: { children: React.ReactNode }) => {
      const [previewFile, setPreviewFile] = React.useState<any>(null);

      React.useEffect(() => {
        const handlePreview = (e: CustomEvent) => {
          console.log('[S3 Private] Received preview request:', e.detail);
          setPreviewFile(e.detail);
        };

        window.addEventListener('s3-private-preview', handlePreview as any);
        return () => {
          window.removeEventListener('s3-private-preview', handlePreview as any);
        };
      }, []);

      return (
        <React.Fragment>
          {props.children}
          {previewFile && (
            <S3PrivatePreview value={[previewFile]} initialIndex={0} onClose={() => setPreviewFile(null)} />
          )}
        </React.Fragment>
      );
    };

    this.app.addComponents({
      S3PrivatePreviewGlobal: GlobalPreviewContainer,
    });

    // We need to mount this component somewhere globally
    this.app.use(GlobalPreviewContainer);

    // Get file-manager plugin instance to register our storage type
    const fileManager = this.app.pm.get(PluginFileManagerClient) as PluginFileManagerClient;

    if (fileManager) {
      // Register s3-private storage type with the file manager
      fileManager.registerStorageType(STORAGE_TYPE_S3_PRIVATE, s3PrivateStorageType);
      console.log('[S3 Private] Storage type registered');
    }

    // Register authenticated file handler for stream mode
    // This overrides default preview behavior for stream endpoint files
    console.log('[S3 Private] Registering authenticated file type handler...');

    attachmentFileTypes.add({
      match(file) {
        // Log EVERY file to debug why match is not triggering
        console.log('[S3 Private] Checking file in attachmentFileTypes:', {
          file,
          url: file?.url,
          preview: file?.preview,
          mimetype: file?.mimetype,
          title: file?.title,
        });

        // Match all stream endpoint URLs from s3-private storage
        const isStreamUrl = file.url && file.url.includes('/api/attachments:stream');

        if (isStreamUrl) {
          console.log('[S3 Private] ✅ MATCHED stream file for authentication:', file.title || file.filename);
        } else {
          console.log('[S3 Private] ❌ NOT stream URL, skipping:', file.url);
        }

        return isStreamUrl;
      },

      getThumbnailURL(file) {
        // Return stream URL - will be handled by AuthenticatedImage
        return file.url;
      },

      // Custom thumbnail renderer with authentication
      ThumbnailPreviewer({ file }) {
        const { url, preview, id, title, mimetype } = file as any;
        const src = preview || url;

        // For images, use custom authenticated component
        if (mimetype?.startsWith('image/')) {
          return (
            <AuthenticatedImage
              file={file}
              originalNode={<img src={src} alt={title} className="ant-upload-list-item-image" />}
            />
          );
        }

        // For videos, show video icon placeholder
        if (mimetype?.startsWith('video/')) {
          return (
            <div
              className="ant-upload-list-item-image"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f0f0f0',
              }}
            >
              <span>🎥</span>
            </div>
          );
        }

        // For audio, show audio icon placeholder
        if (mimetype?.startsWith('audio/')) {
          return (
            <div
              className="ant-upload-list-item-image"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f0f0f0',
              }}
            >
              <span>🎵</span>
            </div>
          );
        }

        // Default fallback
        return <img src={src} alt={title} className="ant-upload-list-item-image" />;
      },

      // Custom full preview modal with authentication
      Previewer: ({ index, list, onSwitchIndex }) => {
        return <S3PrivatePreview value={list} initialIndex={index} onClose={() => onSwitchIndex(null)} />;
      },
    });

    console.log('[S3 Private] Authenticated file type handler registered');

    // Add custom scopes for use in schemas
    this.app.addScopes({
      useAuthenticatedDownload,
    });

    // Add custom components for use in schemas
    this.app.addComponents({
      S3PrivatePreview,
      AuthenticatedImage,
      AuthenticatedVideo,
      AuthenticatedAudio,
    });

    console.log('[S3 Private] Custom components and scopes registered');

    // CRITICAL: Install global click handler for download links
    // This handles <a> tags in tables that bypass attachmentFileTypes
    console.log('[S3 Private] Installing global download link interceptor...');

    const handleDownloadClick = async (e: MouseEvent) => {
      if (e.defaultPrevented) return; // Respect existing handlers (like native preview)

      const target = e.target as HTMLElement;
      const link = target.closest('a[href*="/api/attachments:stream"]') as HTMLAnchorElement;

      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || !href.includes('/api/attachments:stream')) return;

      console.log('[S3 Private] Intercepted download link:', href);
      e.preventDefault();
      e.stopPropagation();

      // Extract file ID from URL
      const fileIdMatch = href.match(/filterByTk=(\d+)/);
      if (!fileIdMatch) {
        console.error('[S3 Private] Could not extract file ID from URL');
        return;
      }

      const fileId = fileIdMatch[1];

      try {
        const response = await this.app.apiClient.request({
          url: 'attachments:stream', // Don't include /api/ - apiClient adds it automatically
          method: 'get',
          params: {
            filterByTk: fileId,
            mode: 'attachment',
          },
          responseType: 'arraybuffer',
        });

        const blob = new Blob([response.data]);

        // Extract filename from Content-Disposition
        const contentDisposition = response.headers?.['content-disposition'];
        let filename = 'download';
        if (contentDisposition) {
          const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (match) {
            filename = match[1].replace(/['"]/g, '');
            filename = decodeURIComponent(filename);
          }
        }

        // Trigger download
        const blobUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        URL.revokeObjectURL(blobUrl);
        downloadLink.remove();

        console.log('[S3 Private] Download successful:', filename);
      } catch (error: any) {
        console.error('[S3 Private] Download failed:', error);
        alert(`Failed to download file: ${error.message}`);
      }
    };

    // Install on document (bubbling phase to respect other handlers)
    document.addEventListener('click', handleDownloadClick, false);
    console.log('[S3 Private] Global download interceptor installed');

    // CRITICAL: Intercept image load errors for authenticated stream URLs
    // This catches <img> tags that fail with 401 and retries with authenticated fetch
    const handleImageError = async (e: ErrorEvent) => {
      const img = e.target as HTMLImageElement;

      // Only handle IMG tags
      if (img.tagName !== 'IMG') return;

      // Check if it's a stream URL and NOT already a blob URL
      const src = img.src;
      if (!src || !src.includes('/api/attachments:stream') || src.startsWith('blob:')) {
        return;
      }

      console.log('[S3 Private] Intercepted image error for:', src);
      e.preventDefault();
      e.stopImmediatePropagation(); // Try to prevent other error handlers

      // Avoid infinite loops
      if (img.dataset.authRetry) {
        console.warn('[S3 Private] Image already retried, giving up:', src);
        return;
      }
      img.dataset.authRetry = 'true';

      // Extract file ID
      const fileIdMatch = src.match(/filterByTk=(\d+)/);
      if (!fileIdMatch) {
        return;
      }
      const fileId = fileIdMatch[1];

      // Show loading placeholder
      const originalSrc = img.src;
      // Transparent 1x1 pixel
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      img.style.opacity = '0.5';

      try {
        console.log('[S3 Private] Fetching authenticated image:', fileId);
        const response = await this.app.apiClient.request({
          url: 'attachments:stream',
          method: 'get',
          params: {
            filterByTk: fileId,
            mode: 'inline',
          },
          responseType: 'arraybuffer',
        });

        const blob = new Blob([response.data], {
          type: response.headers?.['content-type'] || 'image/jpeg',
        });
        const blobUrl = URL.createObjectURL(blob);

        console.log('[S3 Private] Image fetch successful, setting blob URL');
        img.src = blobUrl;
        img.style.opacity = '1';

        // Cleanup when image is removed
        // Note: This is partial cleanup, a MutationObserver would be better for full cleanup
        // but this covers the "image replaced" scenario
        img.onload = () => {
          // Check if we need to revoke previous blob URL if any
        };
      } catch (err) {
        console.error('[S3 Private] Failed to recover image:', err);
        img.src = originalSrc; // Restore original so user sees broken image
      }
    };

    // Use capture phase to catch error events (they don't bubble)
    window.addEventListener('error', handleImageError, true);
    console.log('[S3 Private] Global image error interceptor installed');
  }
}

export default PluginS3PrivateStorageClient;
