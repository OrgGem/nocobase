const http = require('http');

let authToken = '';

function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 13000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (authToken) {
      options.headers['Authorization'] = 'Bearer ' + authToken;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          if (!data.trim()) {
            resolve({ status: res.statusCode, body: null, headers: res.headers });
            return;
          }
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function verify() {
  try {
    const credentials = {
      account: 'admin@nocobase.com',
      username: 'admin@nocobase.com',
      email: 'admin@nocobase.com',
      password: 'admin123',
    };
    const res0 = await request('/api/auth:signIn', 'POST', {
      ...credentials,
      values: credentials,
    });

    if (!res0.body?.data?.token) {
      console.error('Login failed', res0.status, JSON.stringify(res0.body));
      return;
    }
    authToken = res0.body.data.token;

    console.log('--- Checking All Plugins ---');
    const res = await request('/api/pm:list?pageSize=500');
    const plugins = res.body?.data || [];
    const mssql = plugins.find(
      (p) => p.name === '@nocobase/plugin-data-source-mssql' || p.name === 'data-source-mssql',
    );
    if (mssql) {
      console.log('✅ Found mssql plugin:');
      console.log(JSON.stringify(mssql, null, 2));
    } else {
      console.log('❌ mssql plugin NOT found in pm:list');
      // search for mssql in names
      const partial = plugins.filter((p) => p.name && p.name.includes('mssql'));
      console.log(
        'Partial matches:',
        partial.map((p) => p.name),
      );
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

verify();
