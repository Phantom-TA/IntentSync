import { build } from 'esbuild';
import { builtinModules } from 'module';

const external = [
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`),
  'bullmq',
  'ioredis',
  '@prisma/client',
  'commander',
  'chalk',
  'dotenv',
  'zod',
  'octokit',
  'simple-git',
  'chromadb',
  'neo4j-driver',
  '@google/generative-ai',
  'pino'
];

import fs from 'fs';

build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/index.js',
  external,
  sourcemap: true,
  minify: false,
}).then(() => {
  // Copy the Prisma schema into the dist folder so it can be packaged and used on postinstall
  fs.copyFileSync('../../packages/db/prisma/schema.prisma', 'dist/schema.prisma');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
