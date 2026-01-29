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
  authToken = loginRes.body.data.token;

  console.log('--- Executing Raw Query ---');
  const queryRes = await request('/api/external-mssql:testConnection', 'post', {
    // This is a bit of a hack, let's try to find if there's a raw query action
  });

  // Instead, let's just use the list action on Features and check logs for the actual SQL
  console.log('--- Fetching dbo_Features ---');
  const res = await request('/api/dbo_Features:list', 'get', {
    headers: { 'x-data-source': 'test' },
  });
  console.log('Status:', res.status);
  console.log('Body:', JSON.stringify(res.body, null, 2));
}

run().catch(console.error);
