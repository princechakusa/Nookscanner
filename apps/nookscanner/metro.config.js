// Metro for a non-workspace app inside the monorepo: watch packages/shared (linked as
// "@nookscanner/shared": "file:../../packages/shared"). Its dependencies (zod) resolve from this
// app's node_modules only (hierarchical lookup off), so there is exactly one copy of each.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.join(repoRoot, 'packages/shared')];
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
