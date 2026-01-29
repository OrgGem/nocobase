const { initEnv, generatePlugins, generateAppDir, genTsConfigPaths } = require('./packages/core/cli/src/util');
try {
  initEnv();
  generateAppDir();
  generatePlugins();
  genTsConfigPaths();
  console.log('Sync successful');
} catch (e) {
  console.error('Sync failed', e);
}
