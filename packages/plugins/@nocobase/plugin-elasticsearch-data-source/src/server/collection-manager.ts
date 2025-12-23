/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { CollectionManager, CollectionOptions } from '@nocobase/data-source-manager';
import { ElasticsearchRepository } from './repository';

type LocalCollections = Record<string, CollectionOptions>;

const DEFAULT_FIELD_MAP: Record<string, string> = {
  string: 'text',
  json: 'object',
  boolean: 'boolean',
  integer: 'integer',
  bigInt: 'long',
  float: 'float',
  double: 'double',
  date: 'date',
  datetime: 'date',
};

export class ElasticsearchCollectionManager extends CollectionManager {
  public client: Client;

  constructor(options: { client: any }) {
    super(options);
    this.client = options.client;
    this.registerRepositories({
      ElasticsearchRepository,
    });
  }

  private async fetchRemoteMappings() {
    const mappings: any = await this.client.indices.getMapping();
    const payload = mappings?.body || mappings || {};
    return payload;
  }

  private getEsType(field: any) {
    if (field?.rawType) {
      return field.rawType;
    }
    if (DEFAULT_FIELD_MAP[field?.type]) {
      return DEFAULT_FIELD_MAP[field.type];
    }
    return 'text';
  }

  private buildProperties(fields: any[] = []) {
    return fields.reduce((carry, field) => {
      if (field.name === 'id') {
        return carry;
      }
      carry[field.name] = { type: this.getEsType(field) };
      return carry;
    }, {});
  }

  private createFieldsFromMapping(properties: Record<string, any> = {}, local: any[] = []) {
    const localMap = new Map(local?.map((item) => [item.name, item]));

    const mapped = Object.entries(properties).map(([name, prop]) => {
      const field =
        localMap.get(name) ||
        ({
          name,
          type: prop?.type || 'string',
          interface: 'input',
        } as any);
      if (!field.interface) {
        field.interface = 'input';
      }
      return field;
    });

    if (!localMap.has('id')) {
      mapped.unshift({
        name: 'id',
        type: 'string',
        interface: 'input',
        primaryKey: true,
      });
    }

    return mapped;
  }

  private async ensureIndex(name: string, fields: any[] = []) {
    const existsResult: any = await this.client.indices.exists({ index: name });
    const exists = typeof existsResult === 'boolean' ? existsResult : !!existsResult?.body;
    if (exists) {
      return;
    }
    const properties = this.buildProperties(fields);
    await this.client.indices.create({
      index: name,
      body: Object.keys(properties).length
        ? {
            mappings: {
              properties,
            },
          }
        : {},
    });
  }

  private filterSystemIndex(name: string) {
    return !name.startsWith('.');
  }

  async syncFromRemote(localData: LocalCollections = {}) {
    const mappings = await this.fetchRemoteMappings();
    const remoteNames = Object.keys(mappings).filter(this.filterSystemIndex);
    const localNames = Object.keys(localData || {});

    const allNames = Array.from(new Set([...remoteNames, ...localNames]));

    for (const name of allNames) {
      const local = localData?.[name] || {};
      const localFields = local.fields || [];
      const esMapping = mappings?.[name]?.mappings?.properties || {};

      if (!remoteNames.includes(name)) {
        await this.ensureIndex(name, localFields);
      }

      const fields = this.createFieldsFromMapping(esMapping, localFields);

      const options: CollectionOptions = {
        name,
        filterTargetKey: 'id',
        repository: 'ElasticsearchRepository',
        ...local,
        fields,
      };

      if (this.hasCollection(name)) {
        this.extendCollection(options);
      } else {
        this.defineCollection(options);
      }
    }
  }
}
