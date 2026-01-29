# NocoBase Build & Development Guide

Tổng hợp kinh nghiệm từ quá trình phát triển và build NocoBase.

---

## 1. Cài đặt môi trường

### Yêu cầu
- **Node.js**: v20+ (khuyến nghị v22.x)
- **Yarn**: v1.22+
- **Git**

### Thiết lập ban đầu
```bash
# Clone repository
git clone https://github.com/nocobase/nocobase.git
cd nocobase

# Cài đặt dependencies
yarn install

# Khởi tạo database (SQLite mặc định)
yarn nocobase install
```

---

## 2. Khởi động Development Server

### Chế độ phát triển đầy đủ
```bash
yarn dev
```
- Khởi động cả frontend và backend
- Hot reload tự động
- URL mặc định: http://localhost:13000

### Chỉ Backend
```bash
yarn dev:server
```

### Chỉ Frontend
```bash
yarn dev:client
```

---

## 3. Build toàn bộ ứng dụng

### Build Production
```bash
yarn build
```

### Build package cụ thể
```bash
yarn build @nocobase/client
yarn build @nocobase/server
```

---

## 4. Build và Pack Plugin

### Build plugin (không tạo tar)
```bash
yarn nocobase build @nocobase/plugin-<tên-plugin>
```

### Build plugin với tar package
```bash
yarn nocobase build @nocobase/plugin-<tên-plugin> --tar
```
- Tạo file `.tgz` trong `storage/tar/`
- Có thể upload lên NocoBase instance khác

### Build thủ công (nếu lệnh yarn nocobase lỗi)
Trong một số môi trường (như Windows PowerShell), lệnh `yarn nocobase` có thể không tìm thấy executable. Hãy dùng lệnh trực tiếp:

**Build plugin:**
```bash
node packages/core/build/bin/nocobase-build.js packages/plugins/@nocobase/plugin-<tên-plugin>
```

**Build và tạo tar:**
```bash
node packages/core/build/bin/nocobase-build.js packages/plugins/@nocobase/plugin-<tên-plugin> --only-tar
```

### Bỏ qua TypeScript declarations (nếu gặp lỗi)
```bash
yarn nocobase build @nocobase/plugin-<tên-plugin> --no-dts --tar
```

---

## 5. Xử lý lỗi thường gặp

### Lỗi 1: Declaration Build Failed
**Triệu chứng**: Build fail ở bước "build declaration"
**Nguyên nhân**: Lỗi TypeScript types
**Giải pháp**:
```bash
# Kiểm tra lỗi TS trước
cd packages/plugins/@nocobase/plugin-<tên>
npx tsc --noEmit

# Hoặc bỏ qua declaration
yarn nocobase build @nocobase/plugin-<tên> --no-dts --tar
```

### Lỗi 2: Module Not Found
**Triệu chứng**: Cannot find module 'xxx'
**Giải pháp**:
```bash
yarn install

# Nếu dùng workspace packages, build chúng trước
yarn build @nocobase/client
```

### Lỗi 3: Port đã được sử dụng
**Triệu chứng**: Dev server không khởi động được
**Giải pháp**:
```bash
# Windows
netstat -ano | findstr :13000
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :13000
kill -9 <PID>
```

### Lỗi 4: Database bị corrupt
**Giải pháp**:
```bash
# Xóa và reset database (SQLite)
rm storage/.data-*.db
yarn nocobase install
```

### Lỗi 5: License Symlink Failed (Windows)
**Triệu chứng**: Lỗi symlink khi cài đặt hoặc build trên Windows
```
EPERM: operation not permitted, symlink
Error: ENOENT: no such file or directory, open 'LICENSE'
```

**Nguyên nhân**: Windows cần quyền Administrator để tạo symlinks

**Giải pháp**:

**Cách 1: Chạy terminal với quyền Administrator**
```powershell
# Mở PowerShell hoặc CMD với "Run as Administrator"
# Sau đó chạy yarn install
yarn install
```

**Cách 2: Bật Developer Mode (Windows 10/11)**
1. Mở Settings → Update & Security → For developers
2. Bật "Developer Mode"
3. Restart terminal và chạy lại `yarn install`

**Cách 3: Tạo file LICENSE thủ công**
```bash
# Nếu vẫn lỗi, tạo file LICENSE trong package bị lỗi
cd packages/plugins/@nocobase/plugin-<tên>
echo "See root LICENSE file" > LICENSE
```

**Cách 4: Sử dụng Git Bash thay vì PowerShell**
Git Bash có thể xử lý symlinks tốt hơn trên Windows

### Lỗi 7: 'nocobase' is not recognized
**Triệu chứng**: `yarn nocobase ...` trả về lỗi `'nocobase' is not recognized as an internal or external command`.

**Nguyên nhân**: Biến môi trường PATH không trỏ đúng tới node_modules/.bin hoặc wrapper của yarn không hoạt động trên shell hiện tại.

**Giải pháp**:
Sử dụng script build trực tiếp:
```bash
node packages/core/build/bin/nocobase-build.js packages/plugins/@nocobase/plugin-<tên-plugin> --only-tar
```

### Lỗi 6: Pro Plugins License Key
**Triệu chứng**: Không thể sử dụng pro/commercial plugins
**Giải pháp**:
```bash
# Đặt biến môi trường NOCOBASE_PKG_PASSWORD
# (Lấy từ nocobase.com khi mua license)
export NOCOBASE_PKG_PASSWORD=your-license-key

# Hoặc trong file .env
NOCOBASE_PKG_PASSWORD=your-license-key
```

---

## 6. Phát triển Plugin

### Tạo plugin mới
```bash
yarn pm create @nocobase/plugin-my-plugin
```

### Bật plugin trong development
```bash
yarn pm enable @nocobase/plugin-my-plugin
```

### Cấu trúc thư mục plugin
```
packages/plugins/@nocobase/plugin-my-plugin/
├── src/
│   ├── client/        # Frontend code
│   │   └── index.tsx  # Client plugin entry
│   ├── server/        # Backend code
│   │   └── index.ts   # Server plugin entry
│   └── index.ts       # Main entry point
├── package.json
└── tsconfig.json
```

---

## 7. Bảng tham chiếu lệnh

| Lệnh | Mô tả |
|------|-------|
| `yarn dev` | Chạy dev server |
| `yarn build` | Build tất cả packages |
| `yarn nocobase build <pkg> --tar` | Build và đóng gói plugin |
| `yarn pm create <name>` | Tạo plugin mới |
| `yarn pm enable <name>` | Bật plugin |
| `yarn pm disable <name>` | Tắt plugin |
| `yarn nocobase install` | Khởi tạo database |
| `yarn nocobase upgrade` | Chạy migrations |

---

## 8. Tips quan trọng

1. **Dependencies**: Đặt runtime deps trong `dependencies`, không phải `devDependencies`
2. **Externals**: `@nocobase/client` và `@nocobase/server` tự động được exclude
3. **Build trước khi test**: Luôn build plugin khi thay đổi server-side code
4. **Hot reload**: Frontend code hot reload tự động, backend cần restart
5. **Database**: Backup `storage/` folder khi cần giữ data

---

## 9. Deploy Production

### Build
```bash
yarn build --production
```

### Start server
```bash
yarn start
```

### Environment Variables
```bash
DB_DIALECT=postgres    # hoặc mysql, sqlite
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=nocobase
DB_USER=nocobase
DB_PASSWORD=nocobase
APP_PORT=13000
```

---

*Cập nhật: 2026-01-26*
