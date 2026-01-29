/**
 * Mock @nocobase/license-kit for development
 * This allows NocoBase to start without commercial license modules
 */

exports.keyDecrypt = function (str) {
  // Return empty object as decrypted data
  return '{}';
};

exports.getEnvAsync = async function () {
  return {
    sys: process.platform,
    osVer: process.version,
    db: 'postgres',
  };
};
