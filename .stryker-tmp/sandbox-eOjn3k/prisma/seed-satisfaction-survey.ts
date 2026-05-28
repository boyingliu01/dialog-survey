// @ts-nocheck
import { PrismaClient, TemplateStatus } from '@prisma/client';
import { info } from '../src/utils/logger.js';

const prisma = new PrismaClient();

async function seedSatisfactionSurveyTemplate() {
  const existing = await prisma.template.findFirst({
    where: { name: '研发线内部质量满意度调查' },
  });
  if (existing) {
    info('Template already exists', { id: existing.id });
    return existing.id;
  }

  const template = await prisma.template.create({
    data: {
      name: '研发线内部质量满意度调查',
      description: '国际研发线质量满意度调查，了解团队交付物质量满意度与改进方向',
      content: JSON.stringify({
        name: '研发线内部质量满意度调查',
        description: '国际研发线质量满意度调查',
        invitationPrompt: `您好！欢迎参与本次「研发线内部质量满意度」访谈。

📌 **温馨提示**：本次访谈采用异步消息方式进行，不需要您立即回复。您可以在工作日方便时随时参与，今天没空的话明天、后天回复也完全没问题。我们会根据您的节奏持续推进。

准备好后，回复任意内容即可开始。`,
        questions: [
          '请告诉我们您所在的产品线/部门是？（可选：国际BSS产品线、国际OSS产品线、国际数字渠道产品线、国际在线产品线、国际质量效能部）',
          '您的岗位/角色方向是？（可选：需求和规划类、设计开发类、测试类、管理支撑类、营销经营类）',
          '请对您所在研发团队提供交付物（版本/文档/服务等）的质量满意度打分，1分为非常不满意，10分为非常满意。',
          '请对您所在团队上游的交付物质量满意度打分，1分为非常不满意，10分为非常满意（如果直接上游为客户，请填写0表示不涉及）。',
          '您觉得您所在团队提供的版本质量，最近半年有无变化？（显著提升、有一些提升、没什么变化、有一些下降、显著下降）',
          '您觉得哪些结果指标最能客观体现您所在团队的版本质量变化？（最多选3项，如故障数量、生产缺陷相关、缺陷密度、需求响应、客户满意度等）',
          '要进一步提升版本和服务质量，您认为目前最需要提升的方面是什么？（最多选3项，如需求质量、方案质量、开发质量、测试质量、回归测试、缺陷复盘等）',
          '对于具体提升质量的措施或实践，您有什么建议？（自由分享）',
          '如果愿意进一步提供您的宝贵意见和建议，请留下联系方式（可选）。',
        ],
        closingMessage: `感谢您真诚的分享！您的每一条反馈对我们都非常重要，会直接帮助到研发团队的质量改进。

再次感谢您抽时间参与本次访谈，祝您工作顺利，天天开心！🎉`,
        dimensions: [
          {
            id: 'delivery_quality',
            label: '交付物质量',
            keywords: ['质量', '交付物', '版本', '文档'],
          },
          { id: 'upstream_quality', label: '上游质量', keywords: ['上游', '交付'] },
          { id: 'quality_trend', label: '质量趋势', keywords: ['提升', '下降', '变化'] },
          {
            id: 'metrics',
            label: '结果指标',
            keywords: ['故障', '缺陷', '需求', '产能', '满意度'],
          },
          {
            id: 'improvement',
            label: '改进方向',
            keywords: ['需求质量', '开发质量', '测试', '代码', '复盘'],
          },
          { id: 'suggestions', label: '建议', keywords: ['建议', '措施', '实践'] },
        ],
      }),
      status: 'PUBLISHED' as TemplateStatus,
    },
  });

  info('Template created', { id: template.id, name: template.name });
  return template.id;
}

seedSatisfactionSurveyTemplate()
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
