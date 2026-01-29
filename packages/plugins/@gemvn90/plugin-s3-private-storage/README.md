# @gemvn90/plugin-s3-private-storage

Extends NocoBase file-manager to stream files from private S3 buckets via server proxy with ACL support and authenticated blob URL generation.

## Features

- **Private S3 Storage**: Store files in private S3 buckets without public URLs
- **Server Proxy Streaming**: Files are streamed through server-side proxy with full authentication
- **Blob URL Preview**: Client-side authenticated blob URL generation for seamless image/video previews
- **ACL Integration**: Access control via NocoBase ACL system
- **Inline/Download Modes**: Support both preview and download modes
- **Memory Management**: Automatic blob URL cleanup after 5 minutes to prevent memory leaks

## Installation

### Via NPM

```bash
npm install @gemvn90/plugin-s3-private-storage
```

### Via Upload

1. Download the `.tgz` file from releases
2. Go to NocoBase Settings → Plugins
3. Click "Upload plugin" and select the `.tgz` file
4. Enable the plugin

## How It Works

### Authentication Flow

Unlike standard S3 storage that uses public URLs, this plugin implements a secure authentication flow:

1. **Server-side (`getFileURL`)**: Returns proxy endpoint `/api/attachments:stream?filterByTk=${fileId}`
2. **Client-side (`getAuthenticatedUrl`)**: 
   - Fetches file via NocoBase API client (includes `Authorization: Bearer <token>`)
   - Converts response to Blob
   - Generates `blob:` URL for use in HTML elements
   - Caches blob URLs to avoid redundant requests
   - Auto-cleanup after 5 minutes

### Why Blob URLs?

Browser requests to `<img src="/api/...">` don't include Authorization headers. The blob URL approach:
- ✅ Fetches files with proper authentication
- ✅ Works with all HTML media elements (`<img>`, `<video>`, `<audio>`)
- ✅ Maintains security (tokens never exposed in URLs)
- ✅ Provides good performance with client-side caching

## Configuration

### 1. Add S3 Private Storage

After enabling the plugin:

1. Go to **Settings** → **File manager**
2. Click **Add storage**
3. Select **Amazon S3 (Private)** from storage types
4. Configure credentials:
   - **Region**: AWS region (e.g., `us-east-1`)
   - **AccessKey ID**: Your AWS access key
   - **AccessKey Secret**: Your AWS secret key
   - **Bucket**: S3 bucket name
   - **Endpoint** (optional): Custom S3-compatible endpoint (e.g., MinIO)

### 2. Set as Default (Optional)

Check "Default storage" to use this storage for all new file uploads.

## Usage

Once configured, the plugin works seamlessly with NocoBase's attachment field:

```typescript
// In your collection schema
{
  name: 'avatar',
  type: 'attachment',
  uiSchema: {
    'x-component': 'Upload.Attachment',
  }
}
```

Files uploaded through this field will:
- Be stored in your private S3 bucket
- Display previews using authenticated blob URLs
- Be downloadable through the proxy endpoint

## Server API

### Stream Endpoint

```
GET /api/attachments:stream?filterByTk=<FILE_ID>&mode=<inline|attachment>
```

**Parameters:**
- `filterByTk`: Attachment record ID
- `mode`: `inline` (preview) or `attachment` (download)

**Headers Required:**
- `Authorization: Bearer <token>`

**Response:**
- Streams file directly from S3
- Sets appropriate `Content-Type` and `Content-Disposition` headers
- Includes cache headers (`Cache-Control: private, max-age=3600`)

## Development

### Build from Source

```bash
# Clone NocoBase repository
git clone https://github.com/nocobase/nocobase.git
cd nocobase

# Install dependencies
yarn install

# Build plugin
node packages/core/build/bin/nocobase-build.js @gemvn90/plugin-s3-private-storage --no-dts

# For production with tar package
node packages/core/build/bin/nocobase-build.js @gemvn90/plugin-s3-private-storage --tar --no-dts
```

### Project Structure

```
plugin-s3-private-storage/
├── src/
│   ├── client/
│   │   ├── index.tsx              # Client plugin entry
│   │   └── schemas/
│   │       └── s3-private.ts      # Storage schema with getAuthenticatedUrl
│   ├── server/
│   │   ├── index.ts               # Server plugin entry
│   │   ├── plugin.ts              # Plugin class with stream action
│   │   └── storages/
│   │       └── s3-private.ts      # S3 private storage implementation
│   ├── constants.ts               # Shared constants
│   └── index.ts                   # Main entry
├── dist/                          # Build output
├── package.json
└── README.md
```

## Troubleshooting

### Preview Images Not Loading

1. **Check browser console** for authentication errors
2. **Verify ACL permissions**: Ensure logged-in users can access `attachments:stream`
3. **Check S3 credentials**: Verify AccessKey and SecretKey are correct
4. **Network tab**: Look for 401/403 errors in fetch requests

### Memory Issues with Large Files

The blob URL caching has a 5-minute TTL. For very large files or many concurrent previews:

1. Monitor browser memory usage
2. Consider reducing cache TTL in `s3-private.ts`
3. For files >100MB, consider direct download instead of preview

### CORS Issues (Self-hosted S3/MinIO)

If using custom S3-compatible storage, ensure CORS is configured:

```json
{
  "CORSRules": [{
    "AllowedOrigins": ["https://your-nocobase-domain.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"]
  }]
}
```

## Security Considerations

- ✅ **No public URLs**: All files remain private in S3
- ✅ **ACL enforcement**: Server checks permissions before streaming
- ✅ **Token security**: Tokens never exposed in URLs (unlike query parameter approach)
- ✅ **Cache-Control**: Responses marked as private, not cached by proxies
- ⚠️ **Blob URL lifetime**: Cached for 5 minutes - balance between performance and memory

## License

AGPL-3.0

## Author

@gemvn90

## Support

For issues and feature requests, please open an issue on the repository.
