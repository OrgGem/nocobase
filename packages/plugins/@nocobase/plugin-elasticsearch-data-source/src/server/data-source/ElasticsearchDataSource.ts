/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { DataSource, DataSourceOptions, ICollectionManager } from '@nocobase/data-source-manager';
import { ElasticsearchCollectionManager } from './ElasticsearchCollectionManager';

export type ElasticsearchDataSourceOptions = DataSourceOptions & {
  host: string;
  username?: string;
  password?: string;
  client?: any;
  tls?: {
    skipVerify?: boolean;
  };
};

/**
 * Elasticsearch type to NocoBase field type mapping
 */
const ES_TYPE_MAP: Record<string, { type: string; interface?: string; uiSchema?: any }> = {
  text: {
    type: 'text',
    interface: 'textarea',
    uiSchema: { type: 'string', 'x-component': 'Input.TextArea' },
  },
  keyword: {
    type: 'string',
    interface: 'input',
    uiSchema: { type: 'string', 'x-component': 'Input' },
  },
  long: {
    type: 'bigInt',
    interface: 'integer',
    uiSchema: { type: 'number', 'x-component': 'InputNumber', 'x-component-props': { stringMode: true, step: '1' } },
  },
  integer: {
    type: 'integer',
    interface: 'integer',
    uiSchema: { type: 'number', 'x-component': 'InputNumber', 'x-component-props': { stringMode: true, step: '1' } },
  },
  short: {
    type: 'integer',
    interface: 'integer',
    uiSchema: { type: 'number', 'x-component': 'InputNumber', 'x-component-props': { stringMode: true, step: '1' } },
  },
  byte: {
    type: 'integer',
    interface: 'integer',
    uiSchema: { type: 'number', 'x-component': 'InputNumber', 'x-component-props': { stringMode: true, step: '1' } },
  },
  double: {
    type: 'double',
    interface: 'number',
    uiSchema: { type: 'number', 'x-component': 'InputNumber' },
  },
  float: {
    type: 'float',
    interface: 'number',
    uiSchema: { type: 'number', 'x-component': 'InputNumber' },
  },
  half_float: {
    type: 'float',
    interface: 'number',
    uiSchema: { type: 'number', 'x-component': 'InputNumber' },
  },
  scaled_float: {
    type: 'decimal',
    interface: 'number',
    uiSchema: { type: 'number', 'x-component': 'InputNumber', 'x-component-props': { stringMode: true } },
  },
  date: {
    type: 'datetime',
    interface: 'datetime',
    uiSchema: { type: 'string', 'x-component': 'DatePicker', 'x-component-props': { showTime: true } },
  },
  boolean: {
    type: 'boolean',
    interface: 'checkbox',
    uiSchema: { type: 'boolean', 'x-component': 'Checkbox' },
  },
  binary: {
    type: 'blob',
    uiSchema: { type: 'string', 'x-component': 'Input' },
  },
  object: {
    type: 'json',
    interface: 'json',
    uiSchema: { type: 'object', 'x-component': 'Input.TextArea' },
  },
  nested: {
    type: 'json',
    interface: 'json',
    uiSchema: { type: 'object', 'x-component': 'Input.TextArea' },
  },
  ip: {
    type: 'string',
    interface: 'input',
    uiSchema: { type: 'string', 'x-component': 'Input' },
  },
};

class HttpElasticsearchClient {
  private host: string;
  private username?: string;
  private password?: string;
  private logger?: {
    warn?: (...args: any[]) => void;
    error?: (...args: any[]) => void;
    info?: (...args: any[]) => void;
  };
  private tls?: any;

  constructor(options: { host: string; username?: string; password?: string; logger?: any; tls?: any }) {
    this.host = options.host;
    this.username = options.username;
    this.password = options.password;
    this.logger = options.logger;
    this.tls = options.tls;
  }

  private buildHeaders(hasBody: boolean) {
    const headers: Record<string, string> = {};
    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.username) {
      const auth = Buffer.from(`${this.username}:${this.password || ''}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }
    return headers;
  }

  private async request(path: string, options: { method?: string; body?: any } = {}) {
    const url = `${this.host.replace(/\/$/, '')}${path}`;
    const { method = 'GET', body } = options;
    const fetchFn = (globalThis as any).fetch;
    if (!fetchFn) {
      throw new Error('Fetch API is not available. Please run NocoBase on Node.js 18+ or provide a fetch polyfill.');
    }

    const fetchOptions: any = {
      method,
      headers: this.buildHeaders(!!body),
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    };

    if (this.tls?.skipVerify) {
      try {
        // Try undici first (Node 18+ native fetch)
        const { Agent } = require('undici');
        fetchOptions.dispatcher = new Agent({
          connect: {
            rejectUnauthorized: false,
          },
        });
      } catch (e) {
        // Fallback for node-fetch or other polyfills that support 'agent'
        const https = require('https');
        fetchOptions.agent = new https.Agent({
          rejectUnauthorized: false,
        });
      }
    }

    const res = await fetchFn(url, fetchOptions);
    const text = await res.text();
    let parsed: any = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch (error) {
      parsed = text;
      this.logger?.warn?.('Failed to parse Elasticsearch response', error);
    }
    return {
      status: res.status,
      body: parsed,
    };
  }

  indices = {
    getMapping: async (params?: { index?: string }) => {
      const path = params?.index ? `/${encodeURIComponent(params.index)}/_mapping` : '/_mapping';
      return this.request(path);
    },
    exists: async ({ index }: { index: string }) => {
      const res = await this.request(`/${encodeURIComponent(index)}`, { method: 'HEAD' });
      return res.status === 200;
    },
    create: async ({ index, body }: { index: string; body?: any }) => {
      return this.request(`/${encodeURIComponent(index)}`, { method: 'PUT', body: body || {} });
    },
    delete: async ({ index }: { index: string }) => {
      return this.request(`/${encodeURIComponent(index)}`, { method: 'DELETE' });
    },
    putMapping: async ({ index, body }: { index: string; body: any }) => {
      return this.request(`/${encodeURIComponent(index)}/_mapping`, { method: 'PUT', body });
    },
  };

  search = async ({ index, body }: { index: string; body?: any }) => {
    return this.request(`/${encodeURIComponent(index)}/_search`, { method: 'POST', body });
  };

  get = async ({ index, id }: { index: string; id: string }) => {
    return this.request(`/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`, { method: 'GET' });
  };

  index = async ({ index, id, document }: { index: string; id?: string; document: any }) => {
    if (id) {
      const path = `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`;
      return this.request(path, { method: 'PUT', body: document });
    }
    const path = `/${encodeURIComponent(index)}/_doc`;
    return this.request(path, { method: 'POST', body: document });
  };

  update = async ({ index, id, doc }: { index: string; id: string; doc: any }) => {
    return this.request(`/${encodeURIComponent(index)}/_update/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: { doc },
    });
  };

  delete = async ({ index, id }: { index: string; id: string }) => {
    return this.request(`/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`, { method: 'DELETE' });
  };

  count = async ({ index, body }: { index: string; body: any }) => {
    return this.request(`/${encodeURIComponent(index)}/_count`, { method: 'POST', body });
  };

  /**
   * Initial scroll search - returns first batch and scroll_id
   */
  scrollSearch = async ({ index, body, scroll = '1m' }: { index: string; body?: any; scroll?: string }) => {
    return this.request(`/${encodeURIComponent(index)}/_search?scroll=${scroll}`, { method: 'POST', body });
  };

  /**
   * Continue scroll - fetches next batch using scroll_id
   */
  scroll = async ({ scrollId, scroll = '1m' }: { scrollId: string; scroll?: string }) => {
    return this.request('/_search/scroll', {
      method: 'POST',
      body: { scroll, scroll_id: scrollId },
    });
  };

  /**
   * Clear scroll context to free resources
   */
  scrollClear = async ({ scrollId }: { scrollId: string | string[] }) => {
    const ids = Array.isArray(scrollId) ? scrollId : [scrollId];
    return this.request('/_search/scroll', {
      method: 'DELETE',
      body: { scroll_id: ids },
    });
  };

  /**
   * Bulk operations - index, update, delete multiple documents
   */
  bulk = async ({ index, operations }: { index?: string; operations: any[] }) => {
    // Convert operations array to NDJSON format
    const ndjson = operations.map((op) => JSON.stringify(op)).join('\n') + '\n';
    const path = index ? `/${encodeURIComponent(index)}/_bulk` : '/_bulk';
    return this.request(path, { method: 'POST', body: ndjson });
  };

  ping = async () => {
    const res = await this.request('/_cluster/health');
    return res.status === 200;
  };

  close = async () => {};
}

export class ElasticsearchDataSource extends DataSource {
  public client: HttpElasticsearchClient;
  public declare options: ElasticsearchDataSourceOptions;
  public introspector: {
    getCollections: () => Promise<string[]>;
    getFields: (index: string) => Promise<any[]>;
  };

  init(options: ElasticsearchDataSourceOptions = {} as ElasticsearchDataSourceOptions) {
    this.options = options;
    this.client = this.createClient(options);
    super.init(options);
    this.introspector = this.createDatabaseIntrospector();
  }

  createCollectionManager(): ICollectionManager {
    return new ElasticsearchCollectionManager({ client: this.client });
  }

  private createClient(options: ElasticsearchDataSourceOptions): HttpElasticsearchClient {
    if (options.client) {
      return options.client;
    }
    const { host, username, password, tls } = options;
    return new HttpElasticsearchClient({
      host,
      username,
      password,
      logger: (options as any).logger,
      tls,
    });
  }

  private inferFieldType(esType: string): { type: string; interface?: string; uiSchema?: any } {
    return (
      ES_TYPE_MAP[esType] || {
        type: 'string',
        interface: 'input',
        uiSchema: { type: 'string', 'x-component': 'Input' },
      }
    );
  }

  static async testConnection(options: ElasticsearchDataSourceOptions): Promise<boolean> {
    if (!options.host) {
      throw new Error('Host is required to test the connection');
    }

    const client = new HttpElasticsearchClient({
      host: options.host,
      username: options.username,
      password: options.password,
      tls: options.tls,
    });

    try {
      const result = await client.ping();
      if (!result) {
        throw new Error('Failed to connect to Elasticsearch cluster');
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect to Elasticsearch: ${message}`);
    }
  }

  async load(options: any = {}) {
    const localData = options?.localData || {};
    await (this.collectionManager as ElasticsearchCollectionManager).syncFromRemote(localData);
  }

  publicOptions() {
    const { password, client, ...rest } = this.options || {};
    return {
      ...rest,
      host: this.options?.host,
      username: this.options?.username,
      isExternal: true,
    };
  }

  async close() {
    if (this.client?.close) {
      await this.client.close();
    }
  }

  createDatabaseIntrospector() {
    return {
      getCollections: async (): Promise<string[]> => {
        const mappings: any = await this.client.indices.getMapping();
        const payload = mappings?.body || mappings || {};
        return Object.keys(payload || {}).filter((name) => !name.startsWith('.'));
      },
      getFields: async (index: string): Promise<any[]> => {
        const mappings: any = await this.client.indices.getMapping({ index });
        const payload = mappings?.body || mappings || {};
        const indexMapping = payload[index]?.mappings?.properties || {};

        const fields: any[] = [];
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const hasPrimaryKey = false;

        for (const [name, prop] of Object.entries(indexMapping)) {
          const esType = (prop as any)?.type || 'object';
          const { type, interface: uiInterface, uiSchema } = this.inferFieldType(esType);

          const fieldDef: any = {
            name,
            type,
            interface: uiInterface,
            field: name,
            uiSchema: {
              ...uiSchema,
              title: name,
            },
          };

          fields.push(fieldDef);
        }

        // Add id field as primary key if not exists
        if (!fields.find((f) => f.name === 'id')) {
          fields.unshift({
            name: 'id',
            type: 'string',
            interface: 'input',
            primaryKey: true,
            uiSchema: {
              type: 'string',
              'x-component': 'Input',
              title: 'id',
            },
          });
        } else {
          const idField = fields.find((f) => f.name === 'id');
          if (idField) {
            idField.primaryKey = true;
          }
        }

        return fields;
      },
    };
  }
}

export { HttpElasticsearchClient };
