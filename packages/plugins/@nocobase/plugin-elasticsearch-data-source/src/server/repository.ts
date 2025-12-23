/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { ICollection, IRepository } from '@nocobase/data-source-manager';
import { ElasticsearchCollectionManager } from './collection-manager';

type FindOptions = {
  filter?: any;
  filterByTk?: any;
  limit?: number;
  offset?: number;
  sort?: any;
};

const ES_RANGE_KEYS = ['$gt', '$gte', '$lt', '$lte'];

function isPlainObject(input: any) {
  return input && typeof input === 'object' && !Array.isArray(input);
}

export class ElasticsearchRepository implements IRepository {
  public collection: ICollection;
  private client: any;
  private index: string;

  constructor(collection: ICollection) {
    this.collection = collection;
    const cm = collection.collectionManager as ElasticsearchCollectionManager;
    this.client = cm.client;
    this.index = collection['name'] || (collection as any).options?.name;
  }

  private wrap(hit: any) {
    if (!hit) {
      return null;
    }
    const source = hit._source || {};
    const id = hit._id || source.id;
    return {
      id,
      ...source,
      toJSON() {
        return { id, ...source };
      },
    };
  }

  private normalizeSort(sort: any) {
    if (!sort) {
      return [];
    }
    if (typeof sort === 'string') {
      return sort.split(',').map((item) => {
        const trimmed = item.trim();
        const desc = trimmed.startsWith('-');
        const field = desc ? trimmed.slice(1) : trimmed;
        return { [field]: { order: desc ? 'desc' : 'asc' } };
      });
    }
    if (Array.isArray(sort)) {
      return sort.map((item) => {
        if (typeof item === 'string') {
          const desc = item.startsWith('-');
          const field = desc ? item.slice(1) : item;
          return { [field]: { order: desc ? 'desc' : 'asc' } };
        }
        return item;
      });
    }
    return [];
  }

  private buildQuery(filter: any): any {
    if (!filter || (Array.isArray(filter) && filter.length === 0)) {
      return { match_all: {} };
    }

    if (Array.isArray(filter)) {
      return {
        bool: {
          must: filter.map((item) => this.buildQuery(item)),
        },
      };
    }

    if (filter.$and) {
      return {
        bool: {
          must: filter.$and.map((item) => this.buildQuery(item)),
        },
      };
    }

    if (filter.$or) {
      return {
        bool: {
          should: filter.$or.map((item) => this.buildQuery(item)),
          minimum_should_match: 1,
        },
      };
    }

    const must: any[] = [];
    const mustNot: any[] = [];

    Object.entries(filter).forEach(([field, value]) => {
      if (field.startsWith('$')) {
        return;
      }

      if (isPlainObject(value)) {
        const bools: any[] = [];
        const range: any = {};
        Object.entries(value as Record<string, any>).forEach(([op, val]) => {
          if (op === '$in') {
            bools.push({ terms: { [field]: val } });
            return;
          }
          if (op === '$ne') {
            mustNot.push({ term: { [field]: val } });
            return;
          }
          if (op === '$like') {
            bools.push({ wildcard: { [field]: String(val).replace(/%/g, '*') } });
            return;
          }
          if (op === '$includes' || op === '$contains') {
            bools.push({ match: { [field]: val } });
            return;
          }
          if (ES_RANGE_KEYS.includes(op)) {
            const key = op.replace('$', '');
            range[key] = val;
            return;
          }
          bools.push({ term: { [field]: val } });
        });

        if (Object.keys(range).length) {
          bools.push({ range: { [field]: range } });
        }

        must.push(...bools);
      } else {
        must.push({ term: { [field]: value } });
      }
    });

    const query: any = {};
    if (must.length) {
      query.must = must;
    }
    if (mustNot.length) {
      query.must_not = mustNot;
    }

    if (!Object.keys(query).length) {
      return { match_all: {} };
    }

    return { bool: query };
  }

  private async search(options: FindOptions) {
    const { filter, limit = 50, offset = 0, sort } = options || {};
    const searchBody: any = {
      query: this.buildQuery(filter),
      from: offset || 0,
      size: limit || 50,
      track_total_hits: true,
    };

    const normalizedSort = this.normalizeSort(sort);
    if (normalizedSort.length) {
      searchBody.sort = normalizedSort;
    }

    const result: any = await this.client.search({
      index: this.index,
      body: searchBody,
    });

    const payload = result?.body || result || {};
    const hits = payload?.hits?.hits || [];
    const total = payload?.hits?.total?.value ?? hits.length;

    return { hits, total };
  }

  async find(options: FindOptions = {}) {
    const { hits } = await this.search(options);
    return hits.map((hit: any) => this.wrap(hit)).filter(Boolean);
  }

  async findAndCount(options: FindOptions = {}) {
    const { hits, total } = await this.search(options);
    const rows = hits.map((hit: any) => this.wrap(hit)).filter(Boolean);
    return [rows, total];
  }

  async findOne(options: any = {}) {
    const { filterByTk, filter } = options;
    if (filterByTk) {
      const result: any = await this.client.get({
        index: this.index,
        id: filterByTk,
      });
      const body = result?.body || result || {};
      if (!body || body.found === false) {
        return null;
      }
      return this.wrap({ _id: body._id || filterByTk, _source: body._source });
    }
    const { hits } = await this.search({ ...options, limit: 1, offset: 0, filter });
    return this.wrap(hits[0]);
  }

  async create(options: any) {
    const values = options?.values || {};
    const { id, ...rest } = values || {};
    const response: any = await this.client.index({
      index: this.index,
      id,
      document: rest,
      refresh: true,
    });
    const body = response?.body || response || {};
    return this.wrap({ _id: body?._id || id, _source: rest });
  }

  async update(options: any) {
    const { filterByTk, values, filter } = options || {};
    if (!filterByTk && !filter) {
      throw new Error('Update requires filter or primary key');
    }
    if (filterByTk) {
      await this.client.update({
        index: this.index,
        id: filterByTk,
        doc: values || {},
        refresh: true,
      });
      return this.findOne({ filterByTk });
    }

    const targets = await this.find({ filter, limit: options?.limit || 1000, offset: options?.offset || 0 });
    const ids = targets.map((item: any) => item.id);
    for (const id of ids) {
      await this.client.update({
        index: this.index,
        id,
        doc: values || {},
        refresh: true,
      });
    }
    return targets.length ? this.find({ filter: { id: { $in: ids } }, limit: ids.length }) : [];
  }

  async destroy(options: any) {
    const { filterByTk, filter } = options || {};
    if (!filterByTk && !filter) {
      throw new Error('Destroy requires filter or primary key');
    }
    if (filterByTk) {
      await this.client.delete({
        index: this.index,
        id: filterByTk,
        refresh: true,
      });
      return;
    }

    const targets = await this.find({ filter, limit: options?.limit || 1000, offset: options?.offset || 0 });
    for (const item of targets) {
      await this.client.delete({
        index: this.index,
        id: item.id,
        refresh: true,
      });
    }
    return;
  }

  async count(options: FindOptions = {}) {
    const { filter } = options || {};
    const res: any = await this.client.count({
      index: this.index,
      query: this.buildQuery(filter),
    });
    const body = res?.body || res || {};
    return body?.count ?? 0;
  }

  async firstOrCreate(options: any) {
    const existing = await this.findOne({ filter: options?.filter || options?.values });
    if (existing) {
      return existing;
    }
    return this.create({ values: options?.values });
  }

  async updateOrCreate(options: any) {
    const existing = await this.findOne({ filter: options?.filter || options?.values });
    if (existing) {
      await this.update({ filterByTk: existing.id, values: options?.values });
      return this.findOne({ filterByTk: existing.id });
    }
    return this.create({ values: options?.values });
  }

  async add() {
    throw new Error('Elasticsearch repository does not support relation add operation');
  }

  async remove() {
    throw new Error('Elasticsearch repository does not support relation remove operation');
  }

  async set() {
    throw new Error('Elasticsearch repository does not support relation set operation');
  }

  async toggle() {
    throw new Error('Elasticsearch repository does not support relation toggle operation');
  }
}
