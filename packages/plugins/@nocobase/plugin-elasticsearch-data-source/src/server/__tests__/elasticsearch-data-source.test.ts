/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { ElasticsearchDataSource } from '../data-source';

const createMockClient = () => {
  const mappings = {
    body: {
      posts: {
        mappings: {
          properties: {
            title: { type: 'text' },
          },
        },
      },
    },
  };

  return {
    indices: {
      getMapping: jest.fn().mockResolvedValue(mappings),
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue({}),
    },
    search: jest.fn().mockResolvedValue({
      hits: {
        hits: [{ _id: '1', _source: { title: 'hello' } }],
        total: { value: 1 },
      },
    }),
    get: jest.fn().mockResolvedValue({
      found: true,
      _id: '1',
      _source: { title: 'hello' },
    }),
    index: jest.fn().mockResolvedValue({ _id: '2' }),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue({ count: 1 }),
    close: jest.fn(),
  };
};

describe('Elasticsearch data source', () => {
  it('should load collections from mappings and local data', async () => {
    const client = createMockClient();
    client.indices.getMapping.mockResolvedValue({ body: {} });

    const ds = new ElasticsearchDataSource({
      name: 'es',
      host: 'http://localhost:9200',
      client: client as any,
    });

    await ds.load({
      localData: {
        posts: {
          fields: [
            {
              name: 'title',
              type: 'string',
              interface: 'input',
            },
          ],
        },
      },
    });

    const collection = ds.collectionManager.getCollection('posts');
    expect(collection).toBeTruthy();
    expect(collection.getField('id')).toBeTruthy();
    expect(collection.getField('title')).toBeTruthy();
    expect(client.indices.create).toHaveBeenCalled();
  });

  it('should provide repository CRUD operations', async () => {
    const client = createMockClient();

    const ds = new ElasticsearchDataSource({
      name: 'es',
      host: 'http://localhost:9200',
      client: client as any,
    });

    await ds.load();

    const repo: any = ds.collectionManager.getRepository('posts');
    const rows = await repo.find();
    expect(rows[0].id).toBe('1');
    expect(rows[0].toJSON()).toMatchObject({ id: '1', title: 'hello' });

    await repo.create({ values: { id: '2', title: 'new' } });
    expect(client.index).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'posts',
        id: '2',
        document: { title: 'new' },
      }),
    );

    await repo.update({ filterByTk: '1', values: { title: 'updated' } });
    expect(client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'posts',
        id: '1',
        doc: { title: 'updated' },
      }),
    );

    await repo.destroy({ filterByTk: '1' });
    expect(client.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'posts',
        id: '1',
      }),
    );
  });
});
