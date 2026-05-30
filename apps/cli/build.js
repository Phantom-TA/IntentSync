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

build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/index.js',
  external,
  sourcemap: true,
  minify: false,
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
