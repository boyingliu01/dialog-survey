import { PrismaClient as FacadeClient, InterviewStatus, SendStatus, TemplateStatus, PlanStatus, BatchReportStatus, BatchReportType } from '../../../src/utils/prisma-client.js';
import type { Prisma } from '../../../src/utils/prisma-client.js';
import { PrismaClient as GeneratedClient } from '../../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../../src/utils/prisma-factory.js';

// value symbols present
const v1: string = InterviewStatus.PENDING;
const v2: string = SendStatus.NOT_SENT;
const v3: string = TemplateStatus.PUBLISHED;
const v4: string = PlanStatus.RUNNING;
const v5: string = BatchReportStatus.COMPLETED;
const v6: string = BatchReportType.SUMMARY;
void [v1, v2, v3, v4, v5, v6];

// type symbols available (exported so noUnusedLocals stays happy)
export type _J = Prisma.InputJsonValue;
export type _U = Prisma.InterviewPlanUpdateInput;
export type _T = Prisma.TransactionClient;

// cross-path type identity (both directions)
declare const g: GeneratedClient;
declare const f: FacadeClient;
const a: FacadeClient = g;
const b: GeneratedClient = f;
void [a, b];

// factory return assignable to BuildAppOptions.prismaFactory param type
const factory: () => FacadeClient = () => createPrismaClient();
void factory;
