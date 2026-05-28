# Issue 5: 统一 PrismaClient 实例创建为单例 Factory

- **优先级**: P2（技术债）
- **触发**: Prisma 5 → 7 升级时发现 21 处直接 `new PrismaClient()`
- **现状**: 每个 repository / service / API 文件各自实例化 PrismaClient

## 问题

当前代码库中分散了 21 处 `new PrismaClient()` 调用：

**src/ 目录（12处）**
| 文件 | 行号 |
|---|---|
| `src/repositories/message.repository.ts` | 7 |
| `src/repositories/template.repository.ts` | 7 |
| `src/repositories/interview-state.repository.ts` | 33 |
| `src/server.ts` | 26 |
| `src/utils/security.ts` | 5 |
| `src/api/admin-templates.ts` | 75 |
| `src/api/templates.ts` | 22 |
| `src/api/health.ts` | 24 |
| `src/services/dead-letter.service.ts` | 4 |
| `src/services/interview-plan.service.ts` | 31 |
| `src/services/analysis.service.ts` | 40 |
| `src/services/stream-message.service.ts` | 189 |

**tests/ 目录（7处）**
`batch-aggregate-api.test.ts`, `admin-delete.test.ts`, `dead-letter.test.ts`, `template-crud.test.ts`, `template-dimensions-api.test.ts`, `schema-analysis-dimensions.test.ts`, `report-api.test.ts`

**seed/ 目录（2处）**
`prisma/seed-test-interview.ts`, `prisma/seed-satisfaction-survey.ts`

## 影响

1. **升级成本高**: Prisma 7 API 要求通过 adapter 初始化，21 处全部需要修改
2. **连接池不共享**: 每个文件独立创建连接，无法复用连接池
3. **生命周期管理困难**: 无法统一处理 `$connect()`/`$disconnect()`
4. **测试 mock 复杂**: 需要分别在 12 个模块层面进行 mock

## 建议方案

新增 `src/utils/db.ts` 单例 Factory:

```typescript
import { PrismaClient } from '@prisma/client';

let _prisma: PrismaClient | null = null;

export function getDb(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

export async function shutdownDb(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
```

好处：
- 升级/换 adapter 只需改 1 处
- 单例共享数据库连接池
- 统一生命周期管理
- 测试时可以用 `vi.mock` 全局替换 Factory

## 验收标准

- [ ] 所有 `new PrismaClient()` 替换为 `getDb()`
- [ ] 测试 mock 改为统一入口
- [ ] `prisma generate` + 全量测试通过
- [ ] Prisma 6/7 升级时工作量从 21 处降至 1 处
