# Issue 6: LLM 端点配置硬编码 / 缺乏灵活切换机制

- **优先级**: P2
- **现象**: LLM 端点（baseURL、apiKey、model）分散在多处硬编码或部分硬编码，无法通过配置灵活切换不同的 LLM 提供商/端点
- **涉及文件**:
  - `src/api/health.ts` — LLM 健康检查硬编码 DashScope 端点（已临时改为读取 `VOLCENGINE_*` 变量，但变量名仍叫 `VOLCENGINE_*`，语义不匹配当前用法）
  - `src/integrations/llm/volcengine.ts` — 类名 `VolcengineLLM` 绑定特定厂商，`fromEnv()` 中使用 `VOLCENGINE_BASE_URL` 等有默认值 `https://ark.cn-beijing.volces.com/api/coding`
- **问题本质**:
  1. **命名绑定厂商**：环境变量名 `VOLCENGINE_API_KEY` 等与火山引擎耦合，无法用于其他 LLM 提供商（如当前使用的公司本地 whalecloud/Qwen3.5）
  2. **默认值硬编码**：`fromEnv()` 中 fallback URL 硬编码为火山引擎地址
  3. **健康检查重复逻辑**：`health.ts` 单独实现了一套 LLM 调用逻辑，与 `src/integrations/llm/volcengine.ts` 中的实现重复，两处配置不同步就会出问题
  4. **缺乏统一 LLM 配置层**：应通过统一的 `LLM_PROVIDER` 环境变量 + `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 来抽象
- **建议方案**:
  - 引入统一的 LLM 配置：`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`、`LLM_PROVIDER`
  - 删除 `fromEnv()` 中的特定厂商默认值
  - 将 health check 改为复用 `VolcengineLLM`（或重命名为 `GenericOpenAILLM`）的实例
  - 类名从 `VolcengineLLM` 改为更通用的名称（如 `ChatCompletionLLM`），因为底层走的是 OpenAI 兼容的 `/v1/chat/completions` 接口
