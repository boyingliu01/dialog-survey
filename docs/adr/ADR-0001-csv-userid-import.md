# ADR-0001: CSV/JSON 批量导入支持 userId 模式（含可导入警告状态）

- **Status**: Accepted (pending R2 design review)
- **Date**: 2026-10-29
- **Issue**: #219
- **Sprint**: sprint/2026-10-29-01

## Context
批量导入（`POST /api/plans/:id/import-preview` + `import-commit`）此前只认手机号：
`parseCsv` 在 `phoneIdx < 0` 时抛错，且手机号为空的行被整行 `continue` 丢弃。
企业通讯录导出的「userId+姓名」名单因此一行都进不来。单成员 `addMember` 早已支持纯 userId。

关键约束（设计期发现）：
1. `import-commit` 的 `commitRowsSchema` 要求 `phone: string.min(1)` 且 `status: literal('ok')`；UI 提交时只 `filter(r => r.status === 'ok')`。若把 userId 模式的「姓名不一致」复用 `name_mismatch` 状态，则手机号模式下 `name_mismatch`（必须视为失败）与 userId 模式下（应为可导入警告）无法区分——同一状态值承担相反语义，commit 层无法判定。
2. 预览结果 `ImportRowResult.status` 是既有对外契约枚举，需保持向后兼容。
3. 无钉钉真名反查时（配额/隐私），仍应能按 userId 导入（DR-002）。

## Decision
1. **模式判定按行**：CSV 解析识别 `USERID_ALIASES`（`userid`/`用户id`/`钉钉id`，大小写不敏感，与 `phone` 别名同风格）。每行：有 userId → **userId 模式**（忽略手机号、跳过钉钉手机号反查）；否则有手机号 → **phone 模式**（现有逻辑不变）；两者皆无 → 该行记为 `missing_identifier`（不可导入，但作为结果返回以便 UI 展示逐行原因）。
2. **表头级错误**：`phoneIdx < 0 && userIdIdx < 0` → 抛 `CSV 必须包含手机号或 userId 列之一`（→ 400）。
3. **新增可导入警告状态 `name_differs`**：userId 模式下姓名与钉钉真名不一致 → `status: 'name_differs'`（该状态在 `IMPORTABLE_STATUSES` 白名单内）、message 提示「仅提示，将按 userId 导入」。手机号模式保持 `name_mismatch`、不可导入。二者状态值不同，避免语义冲突。
4. **姓名反查失败降级（与「不存在」严格区分）**：userId 模式下 `getUserByUserId` 抛错时，只有「用户不存在」（errmsg 含 `user not found`/`no such user`，或 errcode 60121/60111）→ `status: 'user_not_found'`，**不可导入**（userId 本身是错的）；其余（配额 90018、权限、网络）→ `status: 'ok'`、message「姓名未校验」并 `logger.warn`，不阻塞。
5. **权威导入门 = 服务端 `IMPORTABLE_STATUSES` 白名单（`ok` / `name_differs`）**：不向客户端暴露 `importable` 字段——否则客户端可伪造该字段越过校验。`passed` 由 `isImportableStatus()` 派生，提交端 zod schema 用同一状态枚举，两处不可能漂移；`warnings`（`name_differs` 计数）是 `passed` 的子集。
6. **commit 契约放宽（向后兼容）**：`phone` 改为可选；`status` 由 `literal('ok')` 放宽为 `enum(['ok','name_differs'])`（两者皆可导入）；`userId` 仍必填。原有 `name_mismatch` 等非可导入状态仍被拒 → 保持既有「reject non-ok rows」测试语义。
7. **JSON 导入**：`readImportRows` 检测 JSON（mimetype 含 json 或内容以 `[` 开头）→ 解析 `[{userId,name}]`，映射为同一行模型，复用分类/提交管线；解析失败 → 400 `JSON 解析失败：…`。

## Consequences
- `ImportRowResult` 的 `status` 增 `name_differs`/`missing_identifier`/`duplicate_member`/`user_not_found`；`phone` 变为可选（类型放宽，非破坏）。**不新增 `importable` 字段**（见决策 5）。
- 预览响应新增 `warnings` 计数字段（additive，安全）。
- UI：上传提示改为「手机号 / 姓名 / userId（CSV 或 JSON）」；`accept` 加 `.json`；通过/失败计数与提交过滤统一走本地 `isImportable()`（与服务端白名单同值）。
- 现有 `tests/batch-import.test.ts` 的 phone 模式用例语义不变，全部保持绿；新增 userId/JSON 用例。
- 风险：`getUserByUserId` 逐行调用受钉钉配额影响；已按 DR-002 降级，不阻塞导入。

## Alternatives rejected
- 复用 `name_mismatch` 作为可导入警告：语义冲突（手机号模式须视为失败），commit 层无法区分 → 拒绝。
- userId 模式完全不校验姓名：与「姓名用于校验」诉求及 DR-001 冲突 → 拒绝。
- JSON 导入转独立 issue：用户明确要求本次一并实现 → 拒绝延后。
