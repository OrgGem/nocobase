const superagent = require('superagent');

const BASE_URL = 'http://localhost:13001';
const LOGIN_USER = 'admin@nocobase.com';
const LOGIN_PASS = 'admin123';

let authToken = '';

async function request(path, method = 'get', body = null) {
  const url = `${BASE_URL}${path}`;
  const req = superagent[method](url);
  if (authToken) {
    req.set('Authorization', `Bearer ${authToken}`);
  }
  if (body) {
    req.send(body);
  }
  try {
    const res = await req;
    return res;
  } catch (e) {
    if (e.response && e.response.text) {
      try {
        const json = JSON.parse(e.response.text);
        return { status: e.response.status, body: json };
      } catch (err) {
        console.error(`Parse error: Unexpected token '${e.response.text[0]}', "${e.response.text}" is not valid JSON`);
        return { status: e.response.status, body: { error: e.response.text } };
      }
    }
    throw e;
  }
}

async function verify() {
  console.log('--- 0. Logging In ---');
  try {
    const loginRes = await request('/api/auth:signIn', 'post', {
      values: {
        account: LOGIN_USER,
        password: LOGIN_PASS,
      },
      authenticator: 'password',
      account: LOGIN_USER,
      password: LOGIN_PASS,
    });
    if (loginRes.status === 200 && loginRes.body?.data?.token) {
      authToken = loginRes.body.data.token;
      console.log('✅ Logged in successfully.');
    } else {
      console.error('❌ Failed to login:', JSON.stringify(loginRes.body));
      return;
    }
  } catch (e) {
    console.error('❌ Failed to login:', e.message);
    return;
  }

  console.log('\n--- 1. Checking Plugin Status ---');
  try {
    const pmRes = await request('/api/pm:get?name=@nocobase/plugin-data-source-mssql');
    if (pmRes.status === 200 && pmRes.body?.data) {
      const plugin = pmRes.body.data;
      console.log(`✅ Plugin ${plugin.name} is ${plugin.enabled ? 'ENABLED' : 'DISABLED'}.`);
      console.log(`   ID: ${plugin.id}`);
      console.log(`   Display Name: ${plugin.displayName}`);
    } else {
      console.error('❌ Plugin not found or error:', JSON.stringify(pmRes.body));
    }
  } catch (e) {
    console.error('❌ Failed to check plugin status:', e.message);
  }

  console.log('\n--- 2. Checking Controller Reachability (Test Connection) ---');
  try {
    const testRes = await request('/api/dataSources:testConnection', 'post', {
      values: {
        type: 'mssql',
        options: {},
      },
    });
    if (testRes.status === 200) {
      console.log('✅ Controller is reachable and responded to testConnection.');
    } else {
      console.log(`❌ Controller check failed. ${testRes.status} ${JSON.stringify(testRes.body)}`);
    }
  } catch (e) {
    console.error('❌ Failed to check controller:', e.message);
  }

  console.log('\n--- 3. Checking Collection Fields ---');
  try {
    const dsRes = await request('/api/dataSources:list');
    const mssqlDs = dsRes.body?.data?.find((ds) => ds.type === 'mssql');

    if (mssqlDs) {
      const dsKey = mssqlDs.key;
      console.log(`✅ Found MSSQL Data Source: ${dsKey}`);
      console.log(`   Status: ${mssqlDs.status}`);
      console.log(`   Enabled: ${mssqlDs.enabled}`);

      const res = await request(`/api/dataSources.collections:list?associatedIndex=${dsKey}&paginate=false`);
      const collections = res.body?.data || res.body || [];

      let targetCollection = Array.isArray(collections)
        ? collections.find((c) => c.name === 'UpdateRequests' || c.name === 'Features') || collections[0]
        : null;

      if (targetCollection) {
        console.log(`✅ Found ${collections.length} collections. Checking fields for: ${targetCollection.name}`);
        console.log(`   Collection Title: ${targetCollection.title}`);
        console.log(`   Table Name: ${targetCollection.tableName}`);
        console.log(`   Filter Target Key: ${targetCollection.filterTargetKey}`);
        console.log(`   Template: ${targetCollection.template}`);

        const fieldRes = await request(
          `/api/dataSourcesCollections.fields:list?associatedIndex=${dsKey}.${targetCollection.name}&paginate=false`,
        );
        const fields = fieldRes.body?.data || fieldRes.body || [];
        console.log(`✅ Found ${fields.length} fields in ${targetCollection.name}:`);
        if (Array.isArray(fields)) {
          fields.forEach((f) => {
            const title = f.uiSchema?.title || 'N/A';
            console.log(
              `   - ${f.name} (${f.type}) display: "${title}", interface: ${f.interface}${f.primaryKey ? ' [PK]' : ''}`,
            );
          });
        } else {
          console.log('❌ Fields response is not an array:', fields);
        }
      } else {
        console.log('⚠️ No collections found for this data source.');
      }
    } else {
      console.log('⚠️ MSSQL Data Source not found in list.');
    }
  } catch (e) {
    console.error('❌ Failed to check fields:', e.message);
  }
}

verify();
