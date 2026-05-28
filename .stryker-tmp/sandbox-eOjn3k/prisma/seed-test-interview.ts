// @ts-nocheck
import { PrismaClient, InterviewStatus } from '@prisma/client';
import { info } from '../src/utils/logger.js';

const prisma = new PrismaClient();

async function seedTestInterviewPlan() {
  const templateId = process.argv[2] || 'a0ca7d02-9ac9-4388-9822-d83f71dd5ed9';
  const userId = process.argv[3] || '030661134520858298';

  info('Checking for existing interviews', { userId, templateId });

  const existing = await prisma.interview.findFirst({
    where: {
      userId,
    },
  });

  if (existing) {
    info('Interview already exists for user', {
      interviewId: existing.id,
      status: existing.status,
    });
    const template = await prisma.template.findUnique({
      where: { id: templateId },
      select: { name: true },
    });
    info('Template being used', {
      templateName: template?.name || existing.templateId,
    });
    return;
  }

  const interview = await prisma.interview.create({
    data: {
      userId,
      templateId,
      status: InterviewStatus.PENDING,
    },
  });

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: { name: true },
  });

  info('Test interview plan created', {
    interviewId: interview.id,
    userId,
    template: template?.name || templateId,
  });

  info('NEXT STEP: Send ANY message to the DingTalk bot to start the interview.');
}

seedTestInterviewPlan()
  .then(() => {
    info('Seed completed');
    process.exit(0);
  })
  .catch((err) => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
