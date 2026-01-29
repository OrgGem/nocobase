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
  authToken = loginRes.body.data.token;

  console.log('--- Executing Raw Count Query ---');
  // We can use the dataSource:query action if it exists
  const queryRes = await request('/api/test:query', 'post', {
    values: { sql: 'SELECT COUNT(*) as count FROM dbo.Features' },
  });

  console.log('Query result:', JSON.stringify(queryRes.body, null, 2));
}

run().catch(console.error);
