# PostgreSQL Data Source Plugin - Comprehensive Analysis and Implementation Guide

> **Tài liệu phân tích và hướng dẫn phát triển plugin PostgreSQL External Data Source cho NocoBase**
>
> Dựa trên kinh nghiệm phát triển MSSQL Plugin
> Ngày tạo: 2026-01-17

---

## 📋 Mục lục (Table of Contents)

1. [Tổng quan](#tổng-quan)
2. [Cấu trúc File và Thành phần](#cấu-trúc-file-và-thành-phần)
3. [Luồng Xử lý Chi tiết](#luồng-xử-lý-chi-tiết)
4. [Các Vấn đề và Giải pháp](#các-vấn-đề-và-giải-pháp)
5. [So sánh MSSQL và PostgreSQL](#so-sánh-mssql-và-postgresql)
6. [Best Practices](#best-practices)
7. [Testing và Verification](#testing-và-verification)

---

## 🎯 Tổng quan

### Mục tiêu chính (Primary Objectives)

Plugin PostgreSQL External Data Source được thiết kế để:

1.  **Kết nối PostgreSQL Database** - Cho phép NocoBase kết nối với external Postgres databases.
2.  **Introspect Schema** - Tự động phát hiện tables, views, columns, và metadata.
3.  **Multi-Schema Support** - Hỗ trợ schemas (`public`, `auth`, `reporting`, etc.).
4.  **Advanced Type Support** - Hỗ trợ các kiểu dữ liệu mạnh mẽ của Postgres như `JSONB`, `ARRAY`, `UUID`, `TIMESTAMPTZ`.
5.  **Field Management** - Cho phép thêm/sửa fields thông qua UI.

### Chức năng chính (Key Features)

-   ✅ **Schema-aware introspection** - Quản lý tables theo schema (ví dụ: `public.users` vs `auth.users`).
-   ✅ **Collection name normalization** - Chuyển đổi `public.users` → `public_users`.
-   ✅ **External collection support** - Tắt `autoGenId` và `timestamps` mặc định của NocoBase.
-   ✅ **Type mapping** - Mapping chính xác các kiểu Postgres sang NocoBase types.
-   ✅ **Connection pooling** - Quản lý connection hiệu quả với `pg-pool`.

---

## 📁 Cấu trúc File và Thành phần

### Server-side Components

```
packages/plugins/@nocobase/plugin-data-source-postgres/
├── src/
│   ├── server/
│   │   ├── data-source/
│   │   │   └── PostgresExternalDataSource.ts # ⭐ Main data source class
│   │   ├── dialects/
│   │   │   └── postgres-dialect.ts          # ⭐ Postgres dialect extensions
│   │   ├── controllers/
│   │   │   └── ExternalPostgresController.ts # Connection testing
│   │   ├── plugin.ts                        # ⭐ Plugin initialization
│   │   └── utils.ts
│   └── client/
│       ├── index.tsx                        # ⭐ Client registration
│       └── components/
│           └── PostgresConfigForm.tsx       # Configuration UI
└── package.json
```

---

## 🔄 Luồng Xử lý Chi tiết

### 1. Connection & Introspection Flow

Giống với MSSQL, nhưng có các đặc thù của Postgres:

```typescript
// PostgresExternalDataSource.ts

async load() {
  await super.load();

  // 1. Authenticate (sử dụng pg driver)
  await this.database.sequelize.authenticate();

  // 2. Introspect collections
  // Postgres introspector query thường tìm trong information_schema.tables
  const collections = await introspector.getCollections();

  for (const table of collections) {
    // 3. Normalize names
    // Postgres default schema là "public", nhưng cần explicit để tránh conflict
    const fullTableName = `${schema}.${tableName}`; // "public.users"
    const collectionName = fullTableName.replace(/\./g, '_'); // "public_users"

    // 4. Introspect fields
    // Postgres returns types like 'character varying', 'timestamp with time zone', 'jsonb'
    const fields = await introspector.getFields(table);

    // 5. Define collection
    await this.collectionManager.defineCollection({
      name: collectionName,
      title: fullTableName,
      tableName: tableName,
      schema: schema,
      autoGenId: false, // Critical for external tables
      timestamps: false,
      introspected: true,
      isExternal: true,
      fields
    });
  }
}
```

---

## 🐛 Các Vấn đề và Giải pháp (Từ kinh nghiệm MSSQL)

### 1. Vấn đề: "Add field" menu bị thiếu các loại field cơ bản

**Bài học từ MSSQL:** `AddFieldAction` mặc định lọc chỉ hiện Relation fields cho external sources.

**Giải pháp (Code Update):**
Trong `POSTGRESQL` plugin cần đảm bảo client register không bị limit, và core `plugin-data-source-manager` đã được patch (như đã làm với MSSQL).

```typescript
// src/client/index.tsx
plugin.registerType('postgres', {
  label: 'PostgreSQL',
  // ...
  disableAddFields: false, // ✅ Enable Add Field configuration
});
```

### 2. Vấn đề: Datetime Format & Timezone (Critical)

**Bài học từ MSSQL:** MSSQL `DATETIME` không hỗ trợ timezone offset (`+00:00`), gây lỗi khi insert.
**Postgres:** Postgres có 2 loại: `TIMESTAMP` (không timezone) và `TIMESTAMPTZ` (có timezone).

**Giải pháp:**
-   **Với `TIMESTAMPTZ`**: Javascript `Date` object (ISO string có Z) hoạt động tốt.
-   **Với `TIMESTAMP` (Without Timezone)**: Cần hook tương tự MSSQL để strip timezone offset nếu NocoBase gửi ISO string.

```typescript
// PostgresExternalDataSource.ts

// Hook xử lý TIMESTAMP WITHOUT TIME ZONE
this.database.sequelize.addHook('beforeSave', (instance) => {
  // Logic tương tự MSSQL nhưng chỉ áp dụng cho cột TIMESTAMP (không TZ)
  // Nếu cột là TIMESTAMPTZ, để nguyên Date object/ISO string
});
```

### 3. Vấn đề: Default Values (SQL Expressions)

**Bài học từ MSSQL:** `(newid())`, `((0))` bị gửi như string gây lỗi.
**Postgres:** Default values thường là `gen_random_uuid()`, `now()`, `nextval(...)`.

**Giải pháp:**
Cần detect và bỏ qua default values khi insert:

```typescript
// PostgresExternalDataSource.ts > inferFieldType/getFields

const rawDefaultValue = column.defaultValue;
// Postgres function calls often end with () or start with nextval
const isSqlExpression =
    typeof rawDefaultValue === 'string' &&
    (rawDefaultValue.endsWith('()') || rawDefaultValue.startsWith('nextval') || rawDefaultValue.includes('::'));

// Nếu là expression, set defaultValue = undefined trong definition để DB tự xử lý
```

### 4. Vấn đề: UI Schema & Components

**Bài học từ MSSQL:** Cần explicit `uiSchema` trong `inferFieldType` để UI hiển thị đúng (DatePicker, Checkbox...).

**Giải pháp Map Type (Postgres):**

| Postgres Type | NocoBase Type | Interface | UI Schema Component |
|---|---|---|---|
| `boolean` | `boolean` | `checkbox` | `Checkbox` |
| `integer`, `bigint` | `integer` | `integer` | `InputNumber` (step=1) |
| `numeric`, `decimal` | `float` | `number` | `InputNumber` |
| `text`, `varchar` | `string` | `input` | `Input` |
| `timestamp` | `date` | `datetime` | `DatePicker` (showTime=true) |
| `timestamptz` | `date` | `datetime` | `DatePicker` (showTime=true) |
| `date` | `date` | `datetime` | `DatePicker` (showTime=false) |
| `json`, `jsonb` | `json` | `json` | `Input` (JSON mode) |
| `uuid` | `uuid` | `id` | `Input` |

---

## ⚔️ So sánh MSSQL và PostgreSQL

| Đặc điểm | MSSQL | PostgreSQL | Ghi chú Implement |
|---|---|---|---|
| **Driver** | `tedious` | `pg` | Cấu hình connection options khác nhau |
| **Quoting** | `[TableName]` | `"TableName"` | Sequelize tự xử lý, nhưng cần lưu ý khi viết raw query |
| **Schemas** | `dbo` (default) | `public` (default) | Logic normalization giống nhau |
| **Datetime** | `DATETIME` (No offset) | `TIMESTAMPTZ` (Recommend) | Postgres linh hoạt hơn, nhưng cần chú ý `TIMESTAMP` thường |
| **JSON** | String (`NVARCHAR`) | Native `JSONB` | Postgres mapping sang JSON interface tốt hơn |
| **Boolean** | `BIT` (0/1) | Native `BOOLEAN` | Postgres map thẳng sang `true/false` |

---

## 📋 Best Practices cho PostgreSQL Plugin

### 1. Sử dụng `JSONB` thay vì `JSON`
Khi tạo bảng mới hoặc map fields, ưu tiên `JSONB` vì hiệu năng query tốt hơn và NocoBase hỗ trợ tốt.

### 2. Xử lý SSL Connection
PostgreSQL external (ví dụ: AWS RDS, Azure Postgres) thường yêu cầu SSL.
Cần thêm option SSL trong form cấu hình:

```typescript
// PostgresConfigForm.tsx schema
{
  properties: {
    // ...
    ssl: {
      type: 'boolean',
      title: 'Enable SSL',
      'x-decorator': 'FormItem',
      'x-component': 'Checkbox',
    }
  }
}

// PostgresExternalDataSource.ts
if (options.ssl) {
  dialectOptions.ssl = {
    require: true,
    rejectUnauthorized: false // Tùy chọn development
  };
}
```

### 3. Connection Pooling
Sử dụng `pool` settings trong Sequelize options để đảm bảo performance khi tải cao.

```typescript
pool: {
  max: 10,
  min: 0,
  acquire: 30000,
  idle: 10000
}
```

---

## 🧪 Verification Plan

1.  **Connection Test**:
    -   Test với Local Postgres (Docker).
    -   Test với Cloud Postgres (SSL enabled).
2.  **Schema Support**:
    -   Tạo bảng trong schema `public` và `custom_schema`.
    -   Verify NocoBase load đủ cả 2 bảng.
3.  **Type Verification**:
    -   Insert record có `JSONB`, `UUID`, `TIMESTAMPTZ`.
    -   Verify hiển thị đúng trên UI (DatePicker, JSON editor).
4.  **Transaction Safety**:
    -   Verify rollback khi insert lỗi (đặc biệt check lại lỗi "Corresponding BEGIN TRANSACTION" nếu dùng logic hook phức tạp).

---
**Kết luận:** Việc phát triển PostgreSQL plugin sẽ thừa hưởng 80% logic từ MSSQL plugin. 20% khác biệt nằm ở xử lý Type (đặc biệt là JSONB và Timezone) và cấu hình SSL connection.
