const fs = require('fs');
const path = require('path');

function copyTedious() {
  try {
    const src = path.dirname(require.resolve('tedious/package.json', { paths: [process.cwd(), __dirname] }));
    const dest = path.join(__dirname, '../dist/tedious');

    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
    // eslint-disable-next-line no-console
    console.log('[mssql] copied tedious to', dest);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[mssql] failed to copy tedious:', err?.message || err);
  }
}

copyTedious();
