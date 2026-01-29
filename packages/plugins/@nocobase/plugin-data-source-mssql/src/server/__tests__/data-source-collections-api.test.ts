/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createMockServer, MockServer, waitSecond } from '@nocobase/test';
import { CollectionManager, DataSource } from '@nocobase/data-source-manager';

describe('mssql data source collection api', () => {
  let app: MockServer;

  beforeEach(async () => {
    app = await createMockServer({
      plugins: ['nocobase', 'data-source-manager', 'data-source-mssql'],
    });
  });

  afterEach(async () => {
    // Avoid error: "Cannot read properties of undefined (reading 'destroy')"
    // This happens because data-source-manager or mssql plugin might not clean up cleanly in mocked env if we don't mock carefully
    // But for tests, standard app.destroy() is usually enough.
    // However, if we mocked dataSource factory, we are good.
    await app.destroy();
  });

  it('should manage mssql collections (create, get, destroy)', async () => {
    // Mock MssqlExternalDataSource
    class MssqlExternalDataSource extends DataSource {
      static testConnection(options?: any): Promise<boolean> {
        return Promise.resolve(true);
      }

      async load(): Promise<void> {
        await waitSecond(100);
      }

      createCollectionManager(options?: any): any {
        const cm = new CollectionManager(options);

        cm['createCollection'] = async (definition) => {
          const collection = cm.defineCollection(definition);
          return collection;
        };

        const originalRemove = cm.removeCollection.bind(cm);
        cm.removeCollection = (name) => {
          // Mock removal logic if needed, or rely on base
          return originalRemove(name);
        };
        return cm;
      }
    }

    app.dataSourceManager.factory.register('mssql', MssqlExternalDataSource);

    await app.db.getRepository('dataSources').create({
      values: {
        key: 'mssqlInstance1',
        type: 'mssql',
        displayName: 'Mssql',
        options: {},
      },
    });

    await waitSecond(500);

    // 1. Test GET non-existent collection (should fail)
    try {
      await app.agent().resource('dataSources.collections', 'mssqlInstance1.non_existent').get();
      // Should throw, so fail if we get here
      throw new Error('Should have failed with 404');
    } catch (e) {
      expect(e.status).toBe(404);
    }

    // 2. Test CREATE collection
    const createResp = await app
      .agent()
      .resource('dataSources.collections', 'mssqlInstance1')
      .create({
        values: {
          name: 'test_collection',
          title: 'Test Collection',
          fields: [{ name: 'name', type: 'string' }],
        },
      });

    expect(createResp.status).toBe(200);
    expect(createResp.body.name).toBe('test_collection');

    // Verify metadata
    const metadata = await app.db.getRepository('dataSourcesCollections').findOne({
      filter: { name: 'test_collection', dataSourceKey: 'mssqlInstance1' },
    });
    expect(metadata).toBeTruthy();

    // 3. Test GET existing collection
    const getResp = await app.agent().resource('dataSources.collections', 'mssqlInstance1.test_collection').get();
    expect(getResp.status).toBe(200);
    expect(getResp.body.name).toBe('test_collection');

    // 4. Test DESTROY collection
    // Note: destroy action is intercepted by middleware in plugin.ts
    const destroyResp = await app
      .agent()
      .resource('dataSources.collections', 'mssqlInstance1.test_collection')
      .destroy();
    expect(destroyResp.status).toBe(200);
    expect(destroyResp.body.success).toBe(true);

    // Verify metadata removed
    const metadataAfterDestroy = await app.db.getRepository('dataSourcesCollections').findOne({
      filter: { name: 'test_collection', dataSourceKey: 'mssqlInstance1' },
    });
    expect(metadataAfterDestroy).toBeFalsy();

    // Verify in-memory removal (mocked)
    const ds = app.dataSourceManager.get('mssqlInstance1');
    expect(ds.collectionManager.hasCollection('test_collection')).toBe(false);
  });
});
