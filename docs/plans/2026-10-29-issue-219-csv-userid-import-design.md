# 设计文档 — issue #219: CSV/JSON 批量导入支持 userId 列

- 日期: 2026-10-29 (v2 — 采纳 R2 Round 1 专家意见)
- Sprint: sprint/2026-10-29-01
- 关联: ADR-0001-csv-userid-import.md, `phase-outputs/requirements.md`, `phase-outputs/r2-round1-findings.md`
- R1 需求评审: APPROVED 100% (3/3, 3 轮)

## 0. v2 修订摘要（回应 Round 1 的 0/3 反对）
| 专家意见 | 严重度 | v2 处置 |
|---|---|---|
| P1 `importable` 只是响应字段，commit 未强制 → 客户端可伪造绕过 | Major (A1) | **删除 `importable` 作为契约字段**。可导入性成为 `status` 的纯函数 `isImportableStatus()`，服务端单点判定；commit schema 直接以 `status` 白名单表达，客户端无法伪造 |
| P2 `passed` 排除 `name_differs` 却按 `importable` 提交 → 计数与行为矛盾 | High (T-01/F1) | `passed` = 可导入行（**含** `name_differs`）；`warnings` 为 `passed` 的**子集**（显式声明 `warnings ⊆ passed`），`failed` 与之互补且三项和恒等 totalRows |
| P3 反查抛错一律 `ok` → 配额/网络故障伪装成功 | Medium (T-02) | 区分三类：钉钉明确「用户不存在」→ `user_not_found`（不可导入）；配额/权限/网络 → `ok` + 「姓名未校验」+ **`logger.warn` 记录**；未填姓名 → 不反查 |
| P4 JSON 检测脆弱、非数组未校验 | Minor/Low (A3/T-03) | 显式 `Array.isArray`；去 BOM + trim 后判定；结构错误 400 vs 语义错误逐行 200 的边界写死 |
| P5 `phone` 改可选后旧客户端回归 | Low (F3) | 新增显式回归用例（见 5.2） |
| P6 `duplicate_phone` 复用于 userId 措辞误导 | Info (A4) | 新增 `duplicate_member`（与 userId 重复通用），保留 `duplicate_phone` 供手机号模式 |

## 1. 需求摘要
批量导入原先只认手机号，「userId+姓名」通讯录名单在预览阶段被整行丢弃（292 人名单一行进不去）。
需支持：CSV userId 列 + JSON `[{userId,name}]`；有 userId 直接导入、跳过手机号反查；姓名用于校验
（不一致→预警但可导入 DR-001；反查失败→降级放行+标注未校验 DR-002）；分场景错误信息；UI 文案同步。

## 2. 现状（master HEAD，`src/api/plans.ts`）
- `parseCsv`: `phoneIdx < 0` 抛 `CSV missing phone column`；手机号为空的行 `continue` 丢弃。
- `commitRowsSchema`: `phone` 必填 `z.string().min(1)`，`status` 为 `z.literal('ok')`，`userId` 必填。
- 预览响应 `{totalRows, passed, failed, skipped, summary, results}`；`ImportRowResult{rowIndex, phone, inputName, status, userId, dingtalkName, message}`；status 枚举 `ok|name_mismatch|phone_not_found|dingtalk_error|duplicate_phone|phone_invalid`。
- `classifyImportRow`: `isDuplicate`→查缓存；否则 `verifyRow` → `client.getUserIdByMobile(phone)`（内部再调 `getUserByUserId` 取真名）；姓名不一致 → `name_mismatch`（**失败**）；异常 → `phone_not_found` / `dingtalk_error`。
- service：`addMember` 已支持纯 userId；`importMembers(rows:{userId,inputName?,dingtalkName?}[])` 只用 userId，**不依赖 phone**。
- UI `plan-detail.njk`：上传提示已写「支持列头：手机号、姓名、userId」；预览 `getPassedRows` = `ok|name_mismatch|duplicate_phone`；但提交只 `filter(r=>r.status==='ok')`（历史不一致 bug）。

## 3. 方案对比
| 方案 | 说明 | 取舍 |
|---|---|---|
| A. 复用 `name_mismatch` 作可导入警告 | 不改枚举 | ❌ 与手机号模式「失败」语义冲突，commit 无法区分 |
| B. userId 模式不校验姓名 | 最简 | ❌ 与「姓名用于校验」诉求冲突 |
| **C. 新增 `name_differs` 状态 + 状态派生的可导入性（推荐）** | 状态值区分两模式语义；可导入性由 `status` 单点推导 | ✅ 语义清晰、不可伪造、向后兼容 |

**推荐 C。**

## 4. 详细设计

### 4.1 别名与模式判定
```ts
const USERID_ALIASES = new Set(['userid', '用户id', '钉钉id', 'user_id', 'dingtalkid']);
```
表头 `phoneIdx` / `userIdIdx` / `nameIdx` 均大小写不敏感 + trim。
`phoneIdx < 0 && userIdIdx < 0` → throw `CSV 必须包含手机号或 userId 列之一`。

逐行判定：
- 有 `rawUserId` → `mode:'userId'`（phone 可空，按 **userId** 去重）
- 否则有 `rawPhone` → `mode:'phone'`（现状逻辑，按 phone 去重）
- 否则 → `mode:'none'`

### 4.2 行模型
```ts
interface CsvRow {
  phone: string | undefined;
  userId: string | undefined;
  name: string | undefined;
  mode: 'userId' | 'phone' | 'none';
  isDuplicate: boolean;
}

type ImportStatus =
  | 'ok' | 'name_mismatch' | 'name_differs' | 'phone_not_found'
  | 'dingtalk_error' | 'duplicate_phone' | 'duplicate_member'
  | 'phone_invalid' | 'missing_identifier' | 'user_not_found';

interface ImportRowResult {
  rowIndex: number;
  phone: string | undefined;
  inputName: string | undefined;
  status: ImportStatus;
  userId: string | undefined;
  dingtalkName: string | undefined;
  message: string;
}
```
**不新增 `importable` 字段**（P1）。

### 4.3 可导入性 = status 的纯函数（P1，单一事实源）
```ts
/** The ONLY definition of "may be written to the plan". */
const IMPORTABLE_STATUSES: ReadonlySet<ImportStatus> = new Set(['ok', 'name_differs']);
const isImportableStatus = (s: ImportStatus): boolean => IMPORTABLE_STATUSES.has(s);
```
- 预览用它算计数；**commit schema 用同一份白名单**校验。客户端无法通过附加字段伪造可导入性。
- `name_differs` 可导入；`name_mismatch`（手机号模式）不可导入——二者状态值不同，语义互不污染。

### 4.4 分类逻辑（`classifyImportRow`）
- `mode === 'none'` → `missing_identifier`，message「缺少手机号与 userId」。
- `mode === 'userId'`（**不调用** `getUserIdByMobile`；userId 直接取自输入）：
  1. 若 `row.name` 为空 → `ok`（不反查，message「按 userId 导入」）。
  2. 否则调用 `client.getUserByUserId(userId)`：
     - 成功且姓名不一致 → `name_differs`（可导入），message「姓名与钉钉不一致（仅提示），将按 userId 导入」
     - 成功且一致 → `ok`
     - **成功但钉钉未返回姓名**（空串或 `undefined`）→ `ok` + message「姓名未校验：钉钉未返回姓名」，按 DR-002 降级。理由：输入姓名与「空」之间没有发生任何比对，报 `ok`/已验证会谎称做过一次校验（`AC-USERID-002-04`，code-walkthrough 第 1 轮修正）
     - 抛错「用户不存在」（P3 分支 a）→ `user_not_found`（不可导入），message「该 userId 在钉钉通讯录中不存在」
     - 抛错「配额/权限/网络」（P3 分支 b）→ `ok` + message「姓名未校验：<原因>」，并 `logger.warn` 记录（DR-002 降级，故障不再静默）
  3. 重复 userId → `duplicate_member`（不可导入）
- `mode === 'phone'`：完全沿用现有流程与状态（`name_mismatch` = 失败、`duplicate_phone`、`phone_not_found`、`dingtalk_error`、`phone_invalid`）。

> 「用户不存在」的识别：`DingTalkClient.getUserByUserId` 对 `errcode` 抛 `DingTalk user/get failed`。
> 设计上以 errcode 60121/60111（用户不存在类）作为 `user_not_found` 判定；无法归类的一律走分支 b 降级。

### 4.5 预览响应（P2 — 计数自洽）
```jsonc
{
  "totalRows": 3, "passed": 2, "failed": 1, "warnings": 1, "skipped": 0,
  "summary": "all_passed" | "has_errors",
  "results": [ /* 每项含 status，不含 importable */ ]
}
```
不变式（**显式声明并测试**）：
```
passed   = results.filter(r => isImportableStatus(r.status)).length   // 含 name_differs
warnings = results.filter(r => r.status === 'name_differs').length    // warnings ⊆ passed
failed   = totalRows - passed                                          // 与 passed 互补
断言: warnings <= passed 且 passed + failed === totalRows
```
`summary = failed === 0 ? 'all_passed' : 'has_errors'`。

### 4.6 commit 契约（P1 —— 服务端单点判定）
```ts
const commitRowsSchema = z.object({
  rows: z.array(z.object({
    rowIndex: z.number().int().min(1),
    phone: z.string().min(1).optional(),          // P5: 纯 userId 行 phone 为空
    status: z.enum(['ok', 'name_differs']),       // 与 IMPORTABLE_STATUSES 保持一致
    userId: z.string().min(1),                    // 保持必填
    inputName: z.string().optional(),
    dingtalkName: z.string().optional(),
    message: z.string(),
  })),
});
```
- `status` 白名单即 `IMPORTABLE_STATUSES` 的字面量镜像；非可导入状态仍被拒 → 保持既有「reject non-ok rows」测试语义。
- service `importMembers` **不变**（仅用 userId/inputName/dingtalkName）；`phone` 仅用于响应与冲突提示。

### 4.7 JSON 导入（P4）
- 检测顺序：`data.mimetype` 含 `json`，或（去 BOM + 前后空白后）首个字符为 `[` / `{`。
- `JSON.parse` 后：
  - 非数组 → 400 `JSON 必须为数组：[{userId, name}]`（**结构错误**）
  - 数组元素非对象 / 既无 userId 又无 phone → 该元素映射为 `mode:'none'`（**语义错误**，逐行展示，**不 400**）
- 边界写死：**结构错误（语法非法 / 非数组）= 400；语义错误（字段缺失）= 逐行 `missing_identifier`，200**；
  仅当**全部行**都无效时返回 400 `没有可导入的数据行：所有行都缺少手机号与 userId`。
- 映射为 `CsvRow[]`，复用分类/提交管线（零重复逻辑）。
- 键名：`userId`（兼容 `用户id`）；姓名 `name`（兼容 `姓名`）。

### 4.8 错误信息分类（AC3/AC7）
| 场景 | 响应 |
|---|---|
| 无可识别表头列 | 400 `CSV 必须包含手机号或 userId 列之一` |
| 无数据行（`records.length <= 1`） | 400 `CSV 中没有有效数据行` |
| 全部行缺标识 | 400 `没有可导入的数据行：所有行都缺少手机号与 userId` |
| 部分行缺标识 | **200**，逐行 `missing_identifier` 展示 |
| JSON 语法/非数组 | 400 `JSON 解析失败：…` / `JSON 必须为数组：[{userId, name}]` |

### 4.9 UI（`plan-detail.njk`）
- 提示：「上传 CSV 或 JSON 文件，支持列头：手机号 / 姓名 / userId（有 userId 时优先按 userId 导入）」
- `accept=".csv,.json"`。
- 计数：通过 = `passed`（含警告行），其后追加「其中警告 = `warnings`」，失败 = `failed`（P2 对齐）。
- 提交过滤：`filter(r => r.status === 'ok' || r.status === 'name_differs')`（与 `IMPORTABLE_STATUSES` 一致；修复历史 `'ok'`-only bug）。
- 状态列新增：`name_differs` → 「姓名不一致(仅提示)」；`missing_identifier` → 「缺少手机号/userId」；`user_not_found` → 「userId 不存在」。

## 5. 成功标准
### 5.1 验收（AC1–AC9 见 requirements.md）
### 5.2 新增回归用例（P5）
- 旧客户端提交 `{phone, status:'ok', userId, ...}`（带 phone 无缺陷）→ 仍 200 导入成功。
- 提交 `{status:'name_differs', userId}` 无 phone → 200 导入成功。
- 提交 `{status:'name_mismatch'}` → 400（非可导入状态仍被拒）。
- 计数不变式：`warnings <= passed` 且 `passed + failed === totalRows`。

### 5.3 质量门
`tests/batch-import.test.ts` 原 13 用例保持绿；`npx tsc --noEmit`、`npm run lint`、`npm run complexity`、xp-gate 通过。

## 6. 影响面
- 改：`src/api/plans.ts`（解析/分类/可导入性/预览/commit schema）、`src/views/admin/content/plan-detail.njk`（文案/计数/过滤/状态列）。
- 不改：`interview-plan-members.service.ts`（`importMembers` 已够用）、DB schema、`DingTalkClient`（仅新增错误归类辅助）。
- 新增测试：扩充 `tests/batch-import.test.ts`（userId / JSON / 降级 / 计数不变式 / 向后兼容）。

## 7. 风险
| 风险 | 缓解 |
|---|---|
| 逐行 `getUserByUserId` 受钉钉配额影响（292 行 × 1 调用） | 未填姓名的行**不反查**；仅在有姓名时校验；失败按 P3 分支 b 降级并记日志 |
| 手机号模式回归被破坏 | 保留完整 phone 分支与原 13 用例，不改其状态语义 |
| UI 与后端可导入性再次漂移 | 提交过滤与后端正则镜像同一白名单，并用测试锁定 |
