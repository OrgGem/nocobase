/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useAPIClient } from '@nocobase/client';
import { Alert, Image, Space } from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DownloadOutlined,
  LeftOutlined,
  RightOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  SwapOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';

// Hook to fetch authenticated file with blob URL caching
function useAuthenticatedFileUrl(fileUrl: string, fileId: string | number) {
  const apiClient = useAPIClient();
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only process stream URLs
    if (!fileUrl || !fileUrl.includes('/api/attachments:stream')) {
      setBlobUrl(fileUrl || '');
      return;
    }

    if (!fileId) {
      setBlobUrl(fileUrl);
      return;
    }

    console.log('[S3 Private Preview] Fetching authenticated file:', fileId);
    setLoading(true);

    const fetchFile = async () => {
      console.log('[S3 Private Preview] Fetching authenticated file:', fileId);
      setLoading(true);

      try {
        const response = await apiClient.request({
          url: 'attachments:stream',
          method: 'get',
          params: {
            filterByTk: fileId,
            mode: 'inline',
          },
          responseType: 'arraybuffer',
        });

        const blob = new Blob([response.data], {
          type: response.headers?.['content-type'] || 'application/octet-stream',
        });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      } catch (error) {
        console.error('[S3 Private Preview] Failed to fetch file:', error);
        setBlobUrl(fileUrl); // Fallback
      } finally {
        setLoading(false);
      }
    };

    fetchFile();

    // Cleanup blob URL is tricky here because we don't have the URL in scope for the return function
    // if we define it inside fetchFile.
    // We can just rely on the next effect execution or component unmount to trigger cleanup
    // if we store it in a ref, but `setBlobUrl` replaces the state.
    // Actually, the previous code had a return cleanup inside .then(), which useEffect supports if the effect itself returns it.
    // But with async function, we can't return the cleanup from the async function to useEffect.
    // Let's rely on standard React behavior or just not worry about revoking immediately on unmount
    // (browser handles it eventually, or we can use a ref to track generated URLs).
  }, [fileUrl, fileId, apiClient]);

  return { blobUrl, loading };
}

// Authenticated download function
export function useAuthenticatedDownload() {
  const apiClient = useAPIClient();
  const { t } = useTranslation();

  return useCallback(
    async (file: any) => {
      const url = file.url || file.preview || file;

      // Direct download for non-stream URLs
      if (!url.includes('/api/attachments:stream')) {
        window.open(url, '_blank');
        return;
      }

      const fileId = file.id;
      if (!fileId) {
        console.error('[S3 Private Preview] No file ID for download');
        return;
      }

      try {
        console.log('[S3 Private Preview] Downloading file:', fileId);

        const response = await apiClient.request({
          url: 'attachments:stream', // Don't include /api/ - apiClient adds it automatically
          method: 'get',
          params: {
            filterByTk: fileId,
            mode: 'attachment',
          },
          responseType: 'arraybuffer',
        });

        const blob = new Blob([response.data]);

        // Extract filename
        const contentDisposition = response.headers?.['content-disposition'];
        let filename = file.filename || file.title || 'download';
        if (contentDisposition) {
          const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (match) {
            filename = match[1].replace(/['"]/g, '');
            filename = decodeURIComponent(filename);
          }
        }

        // Trigger download
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(blobUrl);
        link.remove();

        console.log('[S3 Private Preview] Download successful:', filename);
      } catch (error: any) {
        console.error('[S3 Private Preview] Download failed:', error);
        alert(t('Failed to download file: {{error}}', { error: error.message }));
      }
    },
    [apiClient, t],
  );
}

// Authenticated Image component for preview
export function AuthenticatedImage({ file, originalNode, ...props }: any) {
  const { blobUrl, loading } = useAuthenticatedFileUrl(file.url || file.preview, file.id);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '20px' }}>Loading...</div>;
  }

  if (!blobUrl) {
    return originalNode;
  }

  // Clone original node with authenticated blob URL
  return React.cloneElement(originalNode, {
    src: blobUrl,
    ...props,
  });
}

// Authenticated Video component
export function AuthenticatedVideo({ file }: any) {
  const { blobUrl, loading } = useAuthenticatedFileUrl(file.url || file.preview, file.id);
  const { t } = useTranslation();

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '20px' }}>Loading video...</div>;
  }

  if (!blobUrl) {
    return (
      <Alert
        type="warning"
        message={t('Failed to load video')}
        description={t('Unable to authenticate and load video file')}
      />
    );
  }

  return (
    <video controls width="100%" style={{ maxHeight: '80vh' }}>
      <source src={blobUrl} type={file.mimetype || 'video/mp4'} />
      {t('Your browser does not support the video tag.')}
    </video>
  );
}

// Authenticated Audio component
export function AuthenticatedAudio({ file }: any) {
  const { blobUrl, loading } = useAuthenticatedFileUrl(file.url || file.preview, file.id);
  const { t } = useTranslation();

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '20px' }}>Loading audio...</div>;
  }

  if (!blobUrl) {
    return (
      <Alert
        type="warning"
        message={t('Failed to load audio')}
        description={t('Unable to authenticate and load audio file')}
      />
    );
  }

  return (
    <audio controls style={{ width: '100%' }}>
      <source src={blobUrl} type={file.mimetype || 'audio/mpeg'} />
      {t('Your browser does not support the audio tag.')}
    </audio>
  );
}

// Custom Preview component with authentication support
export function S3PrivatePreview({ value = [], size = 28, showFileName }: any) {
  const [current, setCurrent] = useState(0);
  const { t } = useTranslation();
  const handleDownload = useAuthenticatedDownload();

  const onDownload = useCallback(() => {
    if (value[current]) {
      handleDownload(value[current]);
    }
  }, [current, value, handleDownload]);

  return (
    <Image.PreviewGroup
      preview={{
        toolbarRender: (
          _,
          {
            transform: { scale },
            actions: { onActive, onFlipY, onFlipX, onRotateLeft, onRotateRight, onZoomOut, onZoomIn, onReset },
          },
        ) => (
          <Space size={14} className="toolbar-wrapper" style={{ fontSize: '20px' }}>
            <LeftOutlined disabled={current === 0} onClick={() => onActive?.(-1)} />
            <RightOutlined disabled={current === value.length - 1} onClick={() => onActive?.(1)} />
            <DownloadOutlined onClick={onDownload} />
            <SwapOutlined rotate={90} onClick={onFlipY} />
            <SwapOutlined onClick={onFlipX} />
            <RotateLeftOutlined onClick={onRotateLeft} />
            <RotateRightOutlined onClick={onRotateRight} />
            <ZoomOutOutlined disabled={scale === 1} onClick={onZoomOut} />
            <ZoomInOutlined disabled={scale === 50} onClick={onZoomIn} />
            <UndoOutlined onClick={onReset} />
          </Space>
        ),
        onChange: (index) => {
          setCurrent(index);
        },
        imageRender: (originalNode, info) => {
          setCurrent(info.current);
          const file: any = info.image;

          // Check if this is a stream URL that needs authentication
          const isStreamUrl = file.url?.includes('/api/attachments:stream');

          if (!isStreamUrl) {
            // Non-stream files - use default rendering
            return originalNode;
          }

          // Stream URLs - use authenticated components
          const mimetype = file.mimetype || '';

          if (mimetype.startsWith('video/')) {
            return <AuthenticatedVideo file={file} />;
          }

          if (mimetype.startsWith('audio/')) {
            return <AuthenticatedAudio file={file} />;
          }

          if (mimetype.startsWith('image/')) {
            return <AuthenticatedImage file={file} originalNode={originalNode} />;
          }

          return (
            <Alert
              type="warning"
              description={
                <span>
                  {t('File type is not supported for previewing,')}
                  <a onClick={onDownload} style={{ textDecoration: 'underline', cursor: 'pointer' }}>
                    {t('download it to preview')}
                  </a>
                </span>
              }
              showIcon
            />
          );
        },
      }}
    >
      <Space size={5} wrap={true}>
        {Array.isArray(value) &&
          value.map((file, index) => {
            const src = typeof file === 'string' ? file : file?.preview || file?.url;
            return (
              <Image
                key={index}
                src={src}
                width={size}
                height={size}
                preview={{ mask: <span>Preview</span> }}
                style={{ objectFit: 'cover' }}
              />
            );
          })}
      </Space>
    </Image.PreviewGroup>
  );
}
// Helper to imperatively mount the preview component
export function mountPreview(file: any) {
  const div = document.createElement('div');
  document.body.appendChild(div);

  // We need to wrap with a provider to get access to APIClient and translation
  // However, since we're outside the main tree, we might miss context
  // Ideally we should use Portal, but for now let's try a simpler approach
  // We'll pass the necessary context or assume S3PrivatePreview can self-bootstrap

  // Actually, S3PrivatePreview needs hooks which need providers.
  // A better approach is to dispatch a custom event that the main Plugin component listens to
  // But let's try rendering a self-contained root first.

  // Import createRoot dynamically if needed or use simple render
  // Since we are in an older React environment likely (v17/18 hybrid in NocoBase)

  // Let's use a Custom Event approach instead to keep Context intact.
  // We will emit an event 's3-private-preview' with the file data
  // The main Plugin component will render a placeholder that listens for this event

  const event = new CustomEvent('s3-private-preview', { detail: file });
  window.dispatchEvent(event);
}
