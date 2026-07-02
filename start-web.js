// Launcher so the preview manager runs Expo web from the customer app.
// Portable: resolves paths relative to this file instead of a hardcoded machine path.
const path = require('path');

const customerDir = path.join(__dirname, 'apps', 'customer');
process.chdir(customerDir);

const port = process.env.PORT || '8081';
process.argv = [process.argv[0], 'expo', 'start', '--web', '--port', port, '--clear'];
process.env.BROWSER = 'none';

require(require.resolve('expo/bin/cli', { paths: [customerDir, __dirname] }));
