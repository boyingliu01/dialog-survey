// @ts-nocheck
function stryNS_9fa48() {
  var g =
    (typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis) ||
    new Function('return this')();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (
    ns.activeMutant === undefined &&
    g.process &&
    g.process.env &&
    g.process.env.__STRYKER_ACTIVE_MUTANT__
  ) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov =
    ns.mutantCoverage ||
    (ns.mutantCoverage = {
      static: {},
      perTest: {},
    });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { Message, PrismaClient } from '@prisma/client';
export class MessageRepository {
  private prisma: PrismaClient;
  constructor(prisma?: PrismaClient) {
    if (stryMutAct_9fa48('2171')) {
      {
      }
    } else {
      stryCov_9fa48('2171');
      this.prisma = stryMutAct_9fa48('2174')
        ? prisma && new PrismaClient()
        : stryMutAct_9fa48('2173')
          ? false
          : stryMutAct_9fa48('2172')
            ? true
            : (stryCov_9fa48('2172', '2173', '2174'), prisma || new PrismaClient());
    }
  }
  async create(data: {
    interviewId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    messageId?: string;
    isVoice?: boolean;
    voiceText?: string;
  }): Promise<Message> {
    if (stryMutAct_9fa48('2175')) {
      {
      }
    } else {
      stryCov_9fa48('2175');
      return this.prisma.message.create(
        stryMutAct_9fa48('2176')
          ? {}
          : (stryCov_9fa48('2176'),
            {
              data: stryMutAct_9fa48('2177')
                ? {}
                : (stryCov_9fa48('2177'),
                  {
                    interviewId: data.interviewId,
                    role: data.role,
                    content: data.content,
                    messageId: data.messageId,
                    isVoice: stryMutAct_9fa48('2180')
                      ? data.isVoice && false
                      : stryMutAct_9fa48('2179')
                        ? false
                        : stryMutAct_9fa48('2178')
                          ? true
                          : (stryCov_9fa48('2178', '2179', '2180'),
                            data.isVoice ||
                              (stryMutAct_9fa48('2181') ? true : (stryCov_9fa48('2181'), false))),
                    voiceText: data.voiceText,
                  }),
            })
      );
    }
  }
  async findByInterview(interviewId: string): Promise<Message[]> {
    if (stryMutAct_9fa48('2182')) {
      {
      }
    } else {
      stryCov_9fa48('2182');
      return this.prisma.message.findMany(
        stryMutAct_9fa48('2183')
          ? {}
          : (stryCov_9fa48('2183'),
            {
              where: stryMutAct_9fa48('2184')
                ? {}
                : (stryCov_9fa48('2184'),
                  {
                    interviewId,
                  }),
              orderBy: stryMutAct_9fa48('2185')
                ? {}
                : (stryCov_9fa48('2185'),
                  {
                    createdAt: stryMutAct_9fa48('2186') ? '' : (stryCov_9fa48('2186'), 'asc'),
                  }),
            })
      );
    }
  }
  async findById(id: string): Promise<Message | null> {
    if (stryMutAct_9fa48('2187')) {
      {
      }
    } else {
      stryCov_9fa48('2187');
      return this.prisma.message.findUnique(
        stryMutAct_9fa48('2188')
          ? {}
          : (stryCov_9fa48('2188'),
            {
              where: stryMutAct_9fa48('2189')
                ? {}
                : (stryCov_9fa48('2189'),
                  {
                    id,
                  }),
            })
      );
    }
  }
  async deleteByInterview(interviewId: string): Promise<number> {
    if (stryMutAct_9fa48('2190')) {
      {
      }
    } else {
      stryCov_9fa48('2190');
      const result = await this.prisma.message.deleteMany(
        stryMutAct_9fa48('2191')
          ? {}
          : (stryCov_9fa48('2191'),
            {
              where: stryMutAct_9fa48('2192')
                ? {}
                : (stryCov_9fa48('2192'),
                  {
                    interviewId,
                  }),
            })
      );
      return result.count;
    }
  }
}
