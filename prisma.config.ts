// @no-test-required: Prisma CLI config — exercised by spike #8/#11 and `prisma generate`
import 'dotenv/config';
import type { PrismaConfig } from 'prisma/config';

const databaseUrl = process.env['DATABASE_URL'];

export default {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: databaseUrl ? { url: databaseUrl } : {},
} satisfies PrismaConfig;
