/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { DataSource, DataSourceOptions, ICollectionManager } from '@nocobase/data-source-manager';
import { ElasticsearchCollectionManager } from './collection-manager';

export type ElasticsearchDataSourceOptions = DataSourceOptions & {
  host: string;
  username?: string;
  password?: string;
  client?: any;
};

class HttpElasticsearchClient {
  private host: string;
  private username?: string;
  private password?: string;

  constructor(options: { host: string; username?: string; password?: string }) {
    this.host = options.host;
    this.username = options.username;
    this.password = options.password;
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
      throw new Error('Fetch API is not available in the current runtime');
    }
    const res = await fetchFn(url, {
      method,
      headers: this.buildHeaders(!!body),
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    const text = await res.text();
    let parsed: any = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    return {
      status: res.status,
      body: parsed,
    };
  }

  indices = {
    getMapping: async () => {
      return this.request('/_mapping');
    },
    exists: async ({ index }: { index: string }) => {
      const res = await this.request(`/${encodeURIComponent(index)}`, { method: 'HEAD' });
      return res.status === 200;
    },
    create: async ({ index, body }: { index: string; body?: any }) => {
      return this.request(`/${encodeURIComponent(index)}`, { method: 'PUT', body: body || {} });
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

  count = async ({ index, query }: { index: string; query: any }) => {
    return this.request(`/${encodeURIComponent(index)}/_count`, { method: 'POST', body: query });
  };

  ping = async () => {
    const res = await this.request('/_cluster/health');
    return res.status === 200;
  };

  close = async () => {};
}

export class ElasticsearchDataSource extends DataSource {
  public client: any;
  public options: ElasticsearchDataSourceOptions;
  public introspector: { getCollections: () => Promise<string[]> };

  init(options: ElasticsearchDataSourceOptions = {} as ElasticsearchDataSourceOptions) {
    this.options = options;
    this.client = this.createClient(options);
    super.init(options);
    this.introspector = this.createDatabaseIntrospector();
  }

  createCollectionManager(): ICollectionManager {
    return new ElasticsearchCollectionManager({ client: this.client });
  }

  private createClient(options: ElasticsearchDataSourceOptions) {
    if (options.client) {
      return options.client;
    }
    const { host, username, password } = options;
    return new HttpElasticsearchClient({
      host,
      username,
      password,
    });
  }

  static async testConnection(options: ElasticsearchDataSourceOptions): Promise<boolean> {
    const client = new HttpElasticsearchClient({
      host: options.host,
      username: options.username,
      password: options.password,
    });
    const result: any = await client.ping();
    return result === true || result?.status === 200;
  }

  async load(options: any = {}) {
    const localData = options?.localData || {};
    await (this.collectionManager as ElasticsearchCollectionManager).syncFromRemote(localData);
  }

  publicOptions() {
    const { password, client, ...rest } = this.options || {};
    return rest;
  }

  async close() {
    if (this.client?.close) {
      await this.client.close();
      return;
    }
    if ((this.client as any)?.transport?.close) {
      await (this.client as any).transport.close();
    }
  }

  createDatabaseIntrospector() {
    return {
      getCollections: async () => {
        const mappings: any = await this.client.indices.getMapping();
        const payload = mappings?.body || mappings || {};
        return Object.keys(payload || {}).filter((name) => !name.startsWith('.'));
      },
    };
  }
}
