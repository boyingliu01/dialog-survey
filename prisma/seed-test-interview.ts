import { info } from '../src/utils/logger.js';
import { InterviewStatus } from '../src/utils/prisma-client.js';
import { createPrismaClient } from '../src/utils/prisma-factory.js';

const prisma = createPrismaClient();

/** The template display name, falling back to the id when the row is missing. */
async function templateNameOf(templateId: string): Promise<string> {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: { name: true },
  });
  return template?.name || templateId;
}

/** Report the existing interview instead of creating a second one. */
async function reportExisting(existing: {
  id: string;
  status: string;
  templateId: string;
}): Promise<void> {
  info('Interview already exists for user', {
    interviewId: existing.id,
    status: existing.status,
  });
  // The EXISTING row's template, not the requested one: when they differ it is
  // precisely the mismatch the operator needs to see.
  info('Template being used', { templateName: await templateNameOf(existing.templateId) });
}

async function seedTestInterviewPlan() {
  const templateId = process.argv[2] || 'a0ca7d02-9ac9-4388-9822-d83f71dd5ed9';
  const userId = process.argv[3] || '030661134520858298';

  info('Checking for existing interviews', { userId, templateId });

  // Idempotent on purpose: re-running the seed must not create a second
  // interview for the same user, because the bot would then have two live
  // conversations for one person.
  const existing = await prisma.interview.findFirst({ where: { userId } });
  if (existing) {
    await reportExisting(existing);
    return;
  }

  const interview = await prisma.interview.create({
    data: { userId, templateId, status: InterviewStatus.PENDING },
  });

  info('Test interview plan created', {
    interviewId: interview.id,
    userId,
    template: await templateNameOf(templateId),
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
