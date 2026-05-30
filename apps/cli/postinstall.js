import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const schemaPath = path.resolve('./dist/schema.prisma');

if (fs.existsSync(schemaPath)) {
  console.log(`Generating Prisma client from ${schemaPath}...`);
  try {
    execSync('prisma generate --schema=' + schemaPath, { stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to generate Prisma client:', err);
    process.exit(1);
  }
} else {
  console.log('No schema found at ' + schemaPath + ', skipping Prisma client generation for local development.');
}
