// Launcher so the preview manager runs Expo web with the correct project root.
process.chdir('C:/Users/mode/Desktop/mode/apps/customer');
const port = process.env.PORT || '8081';
process.argv = [process.argv[0], 'expo', 'start', '--web', '--port', port, '--clear'];
process.env.BROWSER = 'none';
require('C:/Users/mode/Desktop/mode/node_modules/expo/bin/cli');
