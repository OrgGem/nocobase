const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'postgres',
  port: 5432,
});

async function createDb() {
  try {
    await client.connect();
    // Check if database exists
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'nocodb'");
    if (res.rowCount === 0) {
      await client.query('CREATE DATABASE nocodb');
      console.log('Database nocodb created successfully.');
    } else {
      console.log('Database nocodb already exists.');
    }
  } catch (err) {
    console.error('Error creating database:', err);
  } finally {
    await client.end();
  }
}

createDb();
