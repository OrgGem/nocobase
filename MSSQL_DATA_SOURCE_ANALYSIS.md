# MSSQL Data Source Plugin - Comprehensive Analysis and Implementation Guide

> **Tài liệu phân tích và hướng dẫn phát triển plugin MSSQL External Data Source cho NocoBase**
> 
> Cập nhật: 2026-01-16

---

## 📋 Mục lục (Table of Contents)

1. [Tổng quan](#tổng-quan)
2. [Cấu trúc File và Thành phần](#cấu-trúc-file-và-thành-phần)
3. [Luồng Xử lý Chi tiết](#luồng-xử-lý-chi-tiết)
4. [Các Vấn đề và Giải pháp](#các-vấn-đề-và-giải-pháp)
5. [Best Practices](#best-practices)
6. [Testing và Verification](#testing-và-verification)

---

## 🎯 Tổng quan

### Mục tiêu chính (Primary Objectives)

Plugin MSSQL External Data Source được phát triển để:

1. **Kết nối MSSQL Database** - Cho phép NocoBase kết nối với SQL Server databases
2. **Introspect Schema** - Tự động phát hiện tables, columns, và metadata
3. **Multi-Schema Support** - Hỗ trợ databases với nhiều schemas (dbo, identity, resx, etc.)
4. **Field Management** - Cho phép thêm/sửa fields qua UI
5. **Data Display** - Hiển thị records từ MSSQL trong NocoBase table blocks

### Chức năng chính (Key Features)

- ✅ **Schema-aware introspection** - Xử lý schema-qualified table names
- ✅ **Collection name normalization** - Chuyển đổi `dbo.Features` → `dbo_Features`
- ✅ **External collection support** - Không thêm internal fields (id, createdAt, etc.)
- ✅ **Type mapping** - Mapping MSSQL types sang NocoBase types
- ✅ **Connection testing** - Verify connection trước khi save
- ✅ **Version checking** - Đảm bảo SQL Server compatibility (≥12.0.0)

---

## 📁 Cấu trúc File và Thành phần

### Server-side Components

```
packages/plugins/@nocobase/plugin-data-source-mssql/
├── src/
│   ├── server/
│   │   ├── data-source/
│   │   │   └── MssqlExternalDataSource.ts    # ⭐ Main data source class
│   │   ├── dialects/
│   │   │   └── mssql-dialect.ts               # ⭐ MSSQL dialect implementation
│   │   ├── controllers/
│   │   │   └── ExternalMssqlController.ts     # Test connection controller
│   │   ├── plugin.ts                          # ⭐ Plugin initialization
│   │   └── utils.ts                           # Utility functions (sanitize)
│   └── client/
│       ├── index.tsx                          # ⭐ Client-side registration
│       └── components/
│           └── MssqlConfigForm.tsx            # Configuration UI form
└── package.json
```

### Thành phần chính và vai trò (Components and Roles)

#### 1. **MssqlExternalDataSource.ts** 
**Vị trí:** `src/server/data-source/MssqlExternalDataSource.ts`

**Trách nhiệm:**
- Kế thừa từ `DataSource` base class
- Quản lý collection manager (SequelizeCollectionManager)
- Introspect database schema
- Map MSSQL types sang NocoBase types
- Handle authentication và version checking

**Các method quan trọng:**
```typescript
class MssqlExternalDataSource extends DataSource {
  // Tạo collection manager với Database instance
  createCollectionManager(options): SequelizeCollectionManager
  
  // Tạo introspector để khám phá schema
  createDatabaseIntrospector(db): { getCollections, getFields }
  
  // Load và introspect tất cả collections
  async load(): Promise<void>
  
  // Test connection (static method)
  static async testConnection(options): Promise<boolean>
  
  // Map MSSQL types sang NocoBase types
  private inferFieldType(dbType): { type, interface }
}
```

**Key Implementation Details:**
```typescript
async load() {
  await super.load();
  
  // 1. Authenticate database
  await this.database.sequelize.authenticate();
  
  // 2. Check version compatibility
  await this.database.checkVersion();
  
  // 3. Introspect collections
  const collections = await introspector.getCollections();
  
  // 4. For each table:
  for (const table of collections) {
    // 4.1. Build full name and normalized name
    const fullTableName = `${schema}.${tableName}`;
    const collectionName = fullTableName.replace(/\./g, '_');
    
    // 4.2. Introspect fields
    const fields = await introspector.getFields(table);
    
    // 4.3. Define collection with special options
    await this.collectionManager.defineCollection({
      name: collectionName,           // dbo_Features
      title: fullTableName,            // dbo.Features
      tableName: tableName,            // Features
      schema: schema,                  // dbo
      autoGenId: false,               // ⚠️ Critical!
      timestamps: false,              // ⚠️ Critical!
      introspected: true,
      isExternal: true,
      fields
    });
  }
}
```

#### 2. **mssql-dialect.ts**
**Vị trí:** `src/server/dialects/mssql-dialect.ts`

**Trách nhiệm:**
- Định nghĩa MSSQL-specific behaviors
- Version guard configuration
- Dialect options processing

```typescript
export class MssqlDialect extends BaseDialect {
  static dialectName = 'mssql';
  
  // Định nghĩa cách check version
  getVersionGuard() {
    return {
      sql: "SELECT CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR) AS version",
      get: (v: string) => {
        const m = /([\\d.]+)/.exec(v);
        return m?.[0] || v;
      },
      version: '>=12.0.0'  // SQL Server 2014+
    };
  }
  
  // Xử lý encrypt option
  getSequelizeOptions(options: DatabaseOptions) {
    // Merge encrypt setting vào dialectOptions.options
    options.dialectOptions = {
      ...dialectOptions,
      options: {
        ...dialectInnerOptions,
        ...(encrypt === undefined ? {} : { encrypt })
      }
    };
    return options;
  }
}
```

#### 3. **plugin.ts**
**Vị trí:** `src/server/plugin.ts`

**Trách nhiệm:**
- Register dialect với Database
- Register data source type với DataSourceManager
- Define test connection resource

```typescript
export class PluginDataSourceMssqlServer extends Plugin {
  async beforeLoad() {
    // 1. Register dialect
    Database.registerDialect(MssqlDialect);
    
    // 2. Register data source factory
    this.app.dataSourceManager.factory.register('mssql', MssqlExternalDataSource);
  }
  
  async load() {
    // 3. Define test connection endpoint
    this.app.resourcer.define({
      name: 'external-mssql',
      actions: {
        async testConnection(ctx, next) {
          await controller.testConnection(ctx);
          await next();
        }
      }
    });
  }
}
```

#### 4. **Client-side: index.tsx**
**Vị trí:** `src/client/index.tsx`

**Trách nhiệm:**
- Register MSSQL data source type trên client
- Configure UI options

```typescript
export class PluginDataSourceMssqlClient extends Plugin {
  async load() {
    const plugin = this.app.pm.get(PluginDataSourceManagerClient);
    
    plugin.registerType('mssql', {
      label: 'Microsoft SQL Server',
      icon: 'DatabaseOutlined',
      color: 'blue',
      DataSourceSettingsForm: MssqlConfigForm,
      disableTestConnection: false,
      disableAddFields: false,        // ⭐ Enable "Add field" button
    });
  }
}
```

---

## 🔄 Luồng Xử lý Chi tiết

### 1. Connection Flow

```
User creates data source in UI
    ↓
Frontend calls /api/dataSources:create
    ↓
Server validates and tests connection
    ↓
MssqlExternalDataSource.testConnection()
    ├── Create temporary Database instance
    ├── Call sequelize.authenticate()
    ├── Return success/failure
    └── Close database
    ↓
If successful, save to dataSources collection
    ↓
Trigger data source load
    ↓
MssqlExternalDataSource.load()
```

### 2. Introspection Flow

```
load() method execution
    ↓
1. Authenticate database
   await this.database.sequelize.authenticate()
    ↓
2. Check version
   await this.database.checkVersion()
    ↓
3. Create introspector
   introspector = this.createDatabaseIntrospector(db)
    ↓
4. Get all tables
   collections = await introspector.getCollections()
   // Returns: [
   //   { tableName: 'Features', schema: 'dbo' },
   //   { tableName: 'Users', schema: 'identity' },
   //   ...
   // ]
    ↓
5. For each table:
   ├── Build fullTableName: "dbo.Features"
   ├── Build collectionName: "dbo_Features"
   ├── Get fields: await introspector.getFields(table)
   ├── Infer field types using type mapping
   ├── Define collection with options:
   │   ├── name: collectionName
   │   ├── title: fullTableName
   │   ├── tableName: tableName (without schema)
   │   ├── schema: schema
   │   ├── autoGenId: false
   │   ├── timestamps: false
   │   └── fields: [...mapped fields]
   └── Register with collectionManager
    ↓
6. Collections ready for use
```

### 3. Query Flow (Fetching Records)

```
Frontend: GET /api/dbo_Features:list
    ↓
Set header: x-data-source: test
    ↓
DataSourceManager middleware
    ├── Read x-data-source header
    ├── Get data source instance
    └── Set ctx.dataSource
    ↓
Resource middleware
    ├── Parse resource name: "dbo_Features"
    ├── Get collection from collectionManager
    └── collection.tableName = "Features", schema = "dbo"
    ↓
Execute Sequelize query
    ├── Build SQL: SELECT * FROM [dbo].[Features]
    └── Return results
    ↓
Response to frontend
```

---

## 🐛 Các Vấn đề và Giải pháp

### Problem 1: Invalid object name 'dbo.Features'

**Nguyên nhân:**
- Collection được define với `tableName: "dbo.Features"`
- Sequelize generate SQL: `SELECT * FROM [dbo.Features]` (sai!)
- Đúng phải là: `SELECT * FROM [dbo].[Features]`

**Giải pháp:**
```typescript
// ❌ WRONG:
tableName: fullTableName  // "dbo.Features"

// ✅ CORRECT:
tableName: tableName,     // "Features"
schema: schema            // "dbo"
```

### Problem 2: Collections không hiển thị (404 errors)

**Nguyên nhân:**
- Collection name có dấu chấm: `dbo.Features`
- Resource name: `dbo.Features:list`
- NocoBase parse thành `dbo` + `Features:list` (sai!)

**Giải pháp:**
```typescript
// Normalize collection name
const fullTableName = `${schema}.${tableName}`;  // "dbo.Features"
const collectionName = fullTableName.replace(/\./g, '_');  // "dbo_Features"

// Collection definition
{
  name: collectionName,    // "dbo_Features" - for NocoBase
  title: fullTableName,    // "dbo.Features" - for display
  tableName: tableName,    // "Features" - for SQL
  schema: schema           // "dbo" - for SQL
}
```

### Problem 3: "Only one autoincrement field allowed"

**Nguyên nhân:**
- NocoBase tự động thêm field `id` (autoIncrement)
- Table đã có primary key (autoIncrement)
- Conflict!

**Giải pháp:**
```typescript
// Collection options
{
  autoGenId: false,     // ⚠️ Don't add automatic id field
  timestamps: false,    // ⚠️ Don't add createdAt/updatedAt
  introspected: true,   // ⚠️ Mark as introspected
  isExternal: true      // ⚠️ Mark as external
}
```

### Problem 4: "Add field" button không hiện

**Nguyên nhân:**
- Client-side chưa được configure để enable field management
- `disableAddFields` không được set

**Giải pháp:**
```typescript
// In client/index.tsx
plugin.registerType('mssql', {
  // ... other options
  disableAddFields: false,  // ⭐ Enable "Add field" button
});
```

### Problem 5: Type mapping errors (bigint)

**Nguyên nhân:**
- MSSQL type: `BIGINT`
- NocoBase type: `bigInt` (case-sensitive!)

**Giải pháp:**
```typescript
private inferFieldType(dbType: string) {
  const map = {
    'bigint': { type: 'bigInt', interface: 'number' },  // ✅ Correct case
    // ... other mappings
  };
}
```

---

## 📋 Best Practices

### 1. Authentication và Version Checking

```typescript
async load() {
  await super.load();
  
  // ✅ ALWAYS authenticate first
  try {
    await this.database.sequelize.authenticate();
    this.logger?.info?.('Connection established');
  } catch (error) {
    this.logger?.error?.('Authentication failed', sanitize(error));
    throw error;
  }
  
  // ✅ Check version compatibility
  try {
    await this.database.checkVersion();
  } catch (error) {
    this.logger?.warn?.('Version check failed', sanitize(error));
  }
}
```

### 2. Error Handling với Error Chaining

```typescript
try {
  await database.sequelize.authenticate();
} catch (error) {
  // ✅ Preserve original error
  const message = error instanceof Error ? error.message : String(error);
  const connectionError = new Error(`Failed to connect: ${message}`) as Error & { cause?: any };
  connectionError.cause = error;  // ⭐ Chain original error
  throw connectionError;
}
```

### 3. Validation đầy đủ

```typescript
static async testConnection(options?: MssqlDataSourceOptions) {
  // ✅ Validate type và empty string
  if (!options) throw new Error('Options required');
  if (!options.host || typeof options.host !== 'string' || !options.host.trim()) {
    throw new Error('Host is required');
  }
  if (!options.database || typeof options.database !== 'string' || !options.database.trim()) {
    throw new Error('Database is required');
  }
  // ... validate all required fields
}
```

### 4. Schema-aware Collection Definition

```typescript
// ✅ CORRECT pattern
const fullTableName = typeof table === 'string' 
  ? table 
  : (table.schema ? `${table.schema}.${table.tableName}` : table.tableName);

const collectionName = fullTableName.replace(/\./g, '_');

const collectionOptions = {
  name: collectionName,              // Internal name: "dbo_Features"
  title: fullTableName,              // Display name: "dbo.Features"
  tableName: typeof table === 'string' ? table : table.tableName,  // SQL: "Features"
  schema: typeof table === 'string' ? undefined : table.schema,    // SQL: "dbo"
  autoGenId: false,
  timestamps: false,
  introspected: true,
  isExternal: true,
  fields: [...]
};
```

### 5. Resource Cleanup

```typescript
static async testConnection(options) {
  const database = new Database(formatDatabaseOptions(options));
  
  try {
    await database.sequelize.authenticate();
    return true;
  } catch (error) {
    throw error;
  } finally {
    // ✅ ALWAYS cleanup
    await database.close();
  }
}
```

---

## 🧪 Testing và Verification

### Test Script 1: Connection Test

```javascript
const MssqlExternalDataSource = require('./MssqlExternalDataSource');

const options = {
  host: 'localhost',
  port: 1433,
  username: 'sa',
  password: 'Password123',
  database: 'TestDB'
};

// Should succeed
await MssqlExternalDataSource.testConnection(options);

// Should fail with clear message
await MssqlExternalDataSource.testConnection({ ...options, password: 'wrong' });
```

### Test Script 2: Introspection Test

```javascript
const superagent = require('superagent');

// Login
const loginRes = await superagent
  .post('http://localhost:13001/api/auth:signIn')
  .send({ values: { account: 'admin@nocobase.com', password: 'admin123' } });

const token = loginRes.body.data.token;

// Get collections
const collectionsRes = await superagent
  .get('http://localhost:13001/api/dataSources.collections:list?associatedIndex=test&paginate=false')
  .set('Authorization', `Bearer ${token}`);

console.log('Collections:', collectionsRes.body.data.map(c => c.name));
// Expected: ["dbo_Features", "dbo_Users", "identity_Clients", ...]
```

### Test Script 3: Data Fetching

```javascript
// Fetch records from dbo_Features
const recordsRes = await superagent
  .get('http://localhost:13001/api/dbo_Features:list?pageSize=10')
  .set('Authorization', `Bearer ${token}`)
  .set('x-data-source', 'test');

console.log('Records:', recordsRes.body.data);
```

### Verification Checklist

- [ ] Connection test passes ✅
- [ ] Collections are introspected correctly ✅
- [ ] Collection names use underscores (dbo_Features) ✅
- [ ] Records can be fetched ✅
- [ ] "Add field" button is visible in UI ✅
- [ ] Multi-schema support works ✅
- [ ] No server crashes during introspection ✅
- [ ] Type mapping is correct ✅

---

## 🔧 Troubleshooting Guide

### Issue: Server crashes during load

**Check:**
1. Are there collections with dots in names? → Use underscore normalization
2. Are there tables with no primary key? → Check `inferFieldType` logic
3. Are there BIGINT fields? → Verify type mapping uses 'bigInt' not 'bigint'

### Issue: Collections not showing in UI

**Check:**
1. `introspected: true` is set
2. Collection name doesn't contain dots
3. `isExternal: true` is set
4. Collection Manager filter allows introspected collections

### Issue: "Add field" not working

**Check:**
1. Client registration has `disableAddFields: false`
2. `autoGenId: false` is set on collections
3. `timestamps: false` is set on collections

---

## 📚 References

### NocoBase Core Classes

- **DataSource**: `packages/core/data-source-manager/src/data-source.ts`
- **Database**: `packages/core/database/src/database.ts`
- **BaseDialect**: `packages/core/database/src/dialects/base-dialect.ts`
- **SequelizeCollectionManager**: `packages/core/data-source-manager/src/sequelize-collection-manager.ts`

### Related Plugins

- **PostgreSQL Plugin**: `packages/plugins/@nocobase/plugin-data-source-postgres`
- **External Plugin Example**: `trlongvn/nocobase-plugin-external-datasource-mssql`

---

## ✅ Kết luận (Conclusion)

Plugin MSSQL External Data Source giờ đây:

1. ✅ **Tương đồng với PostgreSQL implementation** về authentication và version checking
2. ✅ **Hỗ trợ multi-schema** với proper separation của tableName và schema
3. ✅ **Collection name normalization** để tránh conflicts với NocoBase routing
4. ✅ **External collection support** với autoGenId và timestamps disabled
5. ✅ **Field management enabled** trong UI
6. ✅ **Comprehensive error handling** với error chaining
7. ✅ **Type-safe implementation** với proper TypeScript types

**Luồng xử lý giờ đây:**
- Rõ ràng và nhất quán với các data sources khác
- Tuân thủ NocoBase architecture patterns
- Đảm bảo backward compatibility
- Follow best practices về security và error handling

---

**Cập nhật:** 2026-01-16
**Tác giả:** Development Team
**Version:** 2.0.0
