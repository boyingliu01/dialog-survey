import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const interviews = await prisma.interview.findMany({
    where: { status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      responses: true,
      reports: true,
    },
  });

  console.log(`=== COMPLETED INTERVIEWS (latest 5) ===`);
  console.log(`Total completed: ${interviews.length}\n`);

  for (const iv of interviews) {
    console.log(`ID: ${iv.id}`);
    console.log(`  User: ${iv.userId}`);
    console.log(`  Status: ${iv.status}`);
    console.log(`  Questions: ${iv.currentQuestion}`);
    console.log(`  Followups: ${iv.followupCount}`);
    console.log(`  Messages: ${iv.messages.length}`);
    console.log(`  Responses: ${iv.responses.length}`);
    console.log(`  Reports: ${iv.reports.length}`);
    console.log(`  Created: ${iv.createdAt}`);
    console.log('');

    if (iv.reports.length > 0) {
      console.log(`  --- REPORT for ${iv.id} ---`);
      for (const r of iv.reports) {
        console.log(`    Report ID: ${r.id}`);
        console.log(`    Key Findings: ${JSON.stringify(r.keyFindings)}`);
        console.log(`    Sentiment: ${r.sentiment}`);
        console.log(`    Recommendations: ${JSON.stringify(r.recommendations)}`);
        console.log(`    Content (first 800 chars):`);
        console.log(`    ${r.content.substring(0, 800)}...`);
        console.log('');
      }
    }

    if (iv.messages.length > 0) {
      console.log(`  --- MESSAGES (latest 3) ---`);
      const last3 = iv.messages.slice(-3);
      for (const m of last3) {
        console.log(
          `    [${m.role}]: ${m.content.substring(0, 120)}${m.content.length > 120 ? '...' : ''}`
        );
      }
      console.log('');
    }

    console.log('========================================\n');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
