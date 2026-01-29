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
  if (body && body.headers) {
    for (const [k, v] of Object.entries(body.headers)) {
      req.set(k, v);
    }
  }
  if (body && body.values) {
    req.send(body.values);
  } else if (body && !body.headers) {
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
        return { status: e.response.status, body: { error: e.response.text } };
      }
    }
    throw e;
  }
}

async function run() {
  console.log('--- Logging In ---');
  const loginRes = await request('/api/auth:signIn', 'post', {
    values: { account: LOGIN_USER, password: LOGIN_PASS },
    authenticator: 'password',
    account: LOGIN_USER,
    password: LOGIN_PASS,
  });
  if (!loginRes.body || !loginRes.body.data) {
    console.log('Login failed:', JSON.stringify(loginRes.body, null, 2));
    return;
  }
  authToken = loginRes.body.data.token;

  console.log('--- Fetching Data Sources ---');
  const dsRes = await request('/api/dataSources:list');
  const mssqlDs = dsRes.body?.data?.find((ds) => ds.type === 'mssql');

  if (!mssqlDs) {
    console.log('MSSQL Data source not found');
    return;
  }
  const dsKey = mssqlDs.key;
  console.log(`Using Data Source: ${dsKey}`);

  console.log('--- Fetching Collections ---');
  const collRes = await request(`/api/dataSources.collections:list?associatedIndex=${dsKey}&paginate=false`);
  const collections = collRes.body?.data || collRes.body || [];

  console.log(`--- Fetching Records for all collections ---`);
  for (const c of collections) {
    process.stdout.write(`Fetching ${c.name}... `);
    const recordRes = await request(`/api/${c.name}:list?pageSize=1`, 'get', {
      headers: { 'x-data-source': dsKey },
    });

    if (recordRes.status === 200) {
      const data = recordRes.body?.data || [];
      console.log(`✅ Success! Found ${recordRes.body?.meta?.count || data.length} records.`);
    } else {
      console.log(`❌ Failed: ${recordRes.status}`);
    }
  }
}

run().catch(console.error);
