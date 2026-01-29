/* eslint-disable */

import { MssqlExternalDataSource } from './packages/plugins/@nocobase/plugin-data-source-mssql/src/server/data-source/MssqlExternalDataSource';

console.log('Class imported successfully');

try {
    MssqlExternalDataSource.testConnection({
        host: 'localhost',
        username: 'sa',
        password: 'password',
        database: 'master'
    }).then(() => {
        console.log('Connection success (unexpected)');
    }).catch(e => {
        console.log('Connection failed (expected):', e.message);
        if (e.message.includes('install tedious')) {
            console.error('CRITICAL: Tedious driver not found!');
            process.exit(1);
        }
    });
} catch (e) {
    console.error('Instantiation or sync error:', e);
}
