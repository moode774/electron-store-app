const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'zustand' || moduleName.startsWith('zustand/')) {
    // If importing 'zustand', point to 'zustand/index.js'
    // If importing 'zustand/vanilla', point to 'zustand/vanilla.js', etc.
    const subpath = moduleName === 'zustand' ? 'index.js' : `${moduleName.replace('zustand/', '')}.js`;
    return context.resolveRequest(
      context,
      path.resolve(workspaceRoot, `node_modules/zustand/${subpath}`),
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
