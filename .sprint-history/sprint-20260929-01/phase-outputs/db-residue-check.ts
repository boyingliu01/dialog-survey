import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/utils/prisma-client.js';

const adapter = new PrismaPg({ connectionString: 'postgresql://investigator:zhulaoda@localhost:5432/dialog_survey_test' });
const prisma = new PrismaClient({ adapter });
const rows = await prisma.interview.findMany({
  where: { userId: { in: ['user_zhangsan', 'user_lisi', 'phone-test-1', 'phone-test-2'] } },
  select: { id: true, userId: true, planId: true, status: true, template: { select: { name: true } } },
});
console.log(JSON.stringify(rows, null, 1));
await prisma.$disconnect();
