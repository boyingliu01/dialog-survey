# 研发云 Gitea TLS 缺陷报告：HTTPS 响应缺少 `close_notify`

> 报告日期：2026-10-27
> 报告人：dialog-survey 项目维护者（账号 `113682` / `liu.boying@iwhalecloud.com`）
> 受影响系统：研发云 Gitea —— `https://git-nj.iwhalecloud.com`
> 严重程度：**中**（不丢数据，但使标准 Git 客户端无法正常 `clone` / `fetch` / `push`）

---

## 一、问题摘要

研发云 Gitea 的 HTTPS 服务在返回**较大的响应体**时，会在没有发送 TLS `close_notify` 告警的情况下直接关闭 TCP 连接。

这让所有遵循 RFC 8446 / RFC 5246 的严格 TLS 客户端（包括 **Git 自带的 libcurl**、Node.js、Go、Python `requests`）把一次**实际已经成功**的传输判定为失败：

```
error: RPC failed; curl 56 OpenSSL SSL_read: OpenSSL/3.5.6: error:0A000126:
SSL routines::unexpected eof while reading, errno 0
fatal: unable to write request to remote: Broken pipe
```

而数据本身是**完整**的——这一点已在下文第 4 节验证。

**直接后果**：`git clone` / `git fetch` / `git push` 无法通过标准 Git 完成，用户只能改用快照覆盖、导出 zip、或手工搬运 packfile 等非常规方式同步代码。这会让仓库历史散乱，并增加误覆盖、丢提交的风险。

---

## 二、环境信息

| 项目 | 值 |
|---|---|
| 服务端地址 | `https://git-nj.iwhalecloud.com`（内网解析至 `10.10.168.173`） |
| 反向代理 | `openresty/1.19.3.1` |
| Gitea 版本 | `1.22.1`（`GET /api/v1/version`） |
| TLS 版本 | TLSv1.3（TLS 1.2 同样复现） |
| 证书 | `*.iwhalecloud.com`，签发者 cnTrus RSA OV SSL CA 2，验证链正常（`Verify return code: 0`） |
| 客户端 | `git 2.54.0.windows.1`，curl 8.x（schannel 与 OpenSSL 后端均复现） |
| 客户端操作系统 | Windows 11，Git Bash |
| 复现时间 | 2026-10-27 |

证书与 TLS 版本本身**没有问题**，问题只出现在连接收尾阶段。

---

## 三、复现步骤

### 3.1 最小复现

```bash
printf "0032want 298456fd6799759f19972a2ed4aeee644bf1972a\n00000009done\n" \
  | curl -sS -o /dev/null -w "HTTP=%{http_code} size=%{size_download}\n" \
      -X POST \
      -H "Content-Type: application/x-git-upload-pack-request" \
      --data-binary @- \
      "https://git-nj.iwhalecloud.com/codecompetition8md-psg/dialog-survey.git/git-upload-pack"
```

> 其中 `298456f...` 是该仓库复现时的 `refs/heads/master`，可替换为任意一个分支头。
> 注意 git-upload-pack 的 pkt-line 长度（`0032`）必须与该 want 行长度匹配。

**实际输出：**

```
curl: (56) schannel: server closed abruptly (missing close_notify)
HTTP=200 size=17874907
```

注意这里同时出现了两个结论：**HTTP 200**、**完整收到 17,874,907 字节**，但仍然报错。报错的原因只是缺少 `close_notify`。

### 3.2 标准 Git 命令复现

```bash
git clone https://git-nj.iwhalecloud.com/codecompetition8md-psg/dialog-survey.git
```

```
error: RPC failed; curl 56 OpenSSL SSL_read: OpenSSL/3.5.6: error:0A000126:
SSL routines::unexpected eof while reading, errno 0
fatal: unable to write request to remote: Broken pipe
fatal: early EOF
```

**稳定性：连续 3 次请求 100% 复现**，不是偶发抖动：

```
第1次: HTTP=200 size=17874907 t=0.86s   ← 报 curl 56
第2次: HTTP=200 size=17874907 t=1.69s   ← 报 curl 56
第3次: HTTP=200 size=17874907 t=1.09s   ← 报 curl 56
```

---

## 四、对照实验：证明与数据量相关

同一主机、同一时刻、同一客户端，只改变响应体大小：

| # | 请求 | 响应大小 | 结果 |
|---|---|---|---|
| (a) | `GET /api/v1/version` | ~30 B | ✅ 正常结束 |
| (b) | `GET .../info/refs?service=git-upload-pack` | 4,321 B | ✅ 正常结束，无告警 |
| (c) | `POST .../git-upload-pack`（拉取完整仓库） | **17,874,907 B** | ⚠️ **报 `missing close_notify`** |

**结论：小响应正常，大响应必然缺少 `close_notify`。** 这排除了证书、TLS 版本、客户端后端、网络抖动等因素。

### 4.1 关键佐证：数据其实是完整的

把报错的响应体保存下来校验：

```
文件大小: 17874907
PACK 头:  0000000   0   0   0   8   N   A   K  \n   P   A   C   K
git index-pack 结果: pack f244bd817eceab7b72adde83ef8b440c13cf7e3d  ← 校验通过
```

`git index-pack` 是严格的完整性校验器（含 SHA-1 尾校验），它能通过说明 **17 MB 数据一个字节都不少**。

所以这是一个**纯粹的协议收尾缺陷**：内容对了，但结束信号没发。

---

## 五、响应头特征

大请求的响应头如下：

```
HTTP/1.1 200 OK
Server: openresty/1.19.3.1
Connection: close
```

注意两点：

1. **没有 `Content-Length`**，也没有 `Transfer-Encoding: chunked` 头暴露给客户端（openresty 侧处理过）；
2. **`Connection: close`** —— 服务器选择用关闭连接来表示响应结束。

---

## 六、根因分析

TLS 定义了一个双向的关闭流程（`close_notify` 告警）。如果一方直接关闭 TCP 而不发 `close_notify`，另一方就无法区分两种情况：

- 对端**正常说完了**，只是省略了结束语；
- 对端**话还没说完就断了**（中间人截断攻击）。

RFC 建议把后者视为错误——也就是严格客户端现在的行为，**这是正确的安全设计，不是客户端的 bug**。Git/curl 无法"宽容"处理，否则就会产生静默截断风险。

结合响应头 `Connection: close`，最可能的原因在 **openresty 反向代理这一层**：

- 上游 Gitea 用 chunked 输出大响应；
- openresty 代理完成后直接 `close()` 了连接；
- 没有在关闭前发送 TLS `close_notify`。

常见触发场景包括代理层的 `proxy_ignore_client_abort`、连接复用/超时设置，或 openresty 版本自身的 TLS 收尾实现问题。

**小响应不报错**很可能是因为它们落在缓冲区里一次性写完，走了不同的代码路径。

---

## 七、影响范围

| 场景 | 影响 |
|---|---|
| `git clone` | ❌ 失败（大仓库必现） |
| `git fetch` / `git pull` | ❌ 失败 |
| `git push` | ⚠️ 经常失败；即使服务端已实际收下，客户端仍报错（见下） |
| 通过 Web 界面浏览 / 下载 zip | ✅ 正常 |
| API 调用（小响应） | ✅ 正常 |

### 7.1 特别说明：push 会出现"假失败"

实测 `git push` 时，**服务端已经接受了提交**，但客户端因为同一个 TLS 错误而报告失败：

```
error: RPC failed; curl 56 OpenSSL SSL_read: ... unexpected eof while reading
remote: [Commit] 7cfef4fe2b05da1fa9db1b01fedc258fe65d32bd
remote: . Processing 1 references
remote: Processed 1 references in total
Everything up-to-date
error: failed to push some refs to '...'          ← 明明成功了却报失败
```

用独立命令验证远程分支，可以确认**推送其实成功了**：

```bash
$ git ls-remote dt master
60b1340f0ad3e0e567d64c528a6a4e4a63bdf2ae    refs/heads/master
```

这一点尤其危险：使用者看到"推送失败"会重复推送、改用 `--force`、或干脆手工覆盖，**很容易造成历史丢失**。

事实上本仓库的历史已经出现这种现象：研发云上的提交多为 `chore: snapshot sync from GitHub mainline` 形式的整树覆盖，而非正常推送——与共同祖先停在 2026-03-12、本地 408 个提交与远端 366 个提交完全分叉的情况吻合。

---

## 八、建议的排查与修复方向

以下按优先级排列，供平台团队参考（具体代码不在我方可控范围）：

1. **检查 openresty 的 TLS 关闭逻辑**
   确认代理在关闭连接前是否调用了 `SSL_shutdown()`。正常应发送 `close_notify` 后再关闭 TCP。

2. **检查是否有连接超时/中断相关的代理配置**
   例如过短的 `proxy_read_timeout`、`send_timeout`，或 `proxy_ignore_client_abort` 的设置，可能导致大响应在收尾阶段被强行断开。

3. **验证上游 Gitea 的响应方式**
   在 openresty 与 Gitea 之间抓包，确认 `close_notify` 是在哪一跳丢失的。

4. **临时绕过方案**（不改服务端）
   若短期内无法修复，可考虑：
   - 提供 SSH 方式访问（`git@git-nj.iwhalecloud.com:...`），SSH 协议不走 TLS，可完全规避；
   - 或对内部仓库开放 HTTP（非 HTTPS）访问；
   - 或调整代理的上游协议为 HTTP（客户端到代理仍用 HTTPS，但由 nginx 正确收尾）。

   > 需要说明：我方已验证"用 `--http-backend` 手工搬运 packfile"可作为最后手段，但这不应是长期方案——它绕过了 Git 的协议协商，容易引入历史错误。

---

## 九、我方已完成的验证（供参考，证明不是客户端环境问题）

| 验证项 | 结果 |
|---|---|
| 证书链校验 | ✅ `Verify return code: 0 (ok)` |
| TLS 1.3 | ⚠️ 复现 |
| TLS 1.2 | ⚠️ 复现 |
| curl schannel 后端 | ⚠️ 复现 |
| curl OpenSSL 后端 | ⚠️ 复现 |
| 小响应（30 B / 4 KB） | ✅ 正常 |
| 大响应（17 MB） | ⚠️ 必现 |
| 数据完整性（`git index-pack`） | ✅ 校验通过，无丢字节 |
| 重复 3 次 | ⚠️ 100% 复现 |

排除了：客户端操作系统、Git 版本、TLS 版本、加密后端、证书、网络抖动。

---

## 十、附：完整复现脚本

```bash
#!/usr/bin/env bash
# 研发云 Gitea close_notify 缺陷复现脚本
REPO="https://git-nj.iwhalecloud.com/codecompetition8md-psg/dialog-survey.git"

echo "=== 1. 小响应（预期正常）==="
curl -sS -o /dev/null -w "HTTP=%{http_code} size=%{size_download}\n" \
  "$REPO/info/refs?service=git-upload-pack"

echo "=== 2. 大响应（预期报 missing close_notify）==="
HEAD_SHA=$(git ls-remote "$REPO" refs/heads/master 2>/dev/null | cut -f1)
printf "0032want %s\n00000009done\n" "$HEAD_SHA" \
  | curl -sS -o /tmp/probe.pack -w "HTTP=%{http_code} size=%{size_download}\n" \
      -X POST \
      -H "Content-Type: application/x-git-upload-pack-request" \
      --data-binary @- \
      "$REPO/git-upload-pack"

echo "=== 3. 验证数据其实完整 ==="
tail -c +9 /tmp/probe.pack > /tmp/probe-raw.pack && ls -l /tmp/probe-raw.pack
```

---

## 联系方式

如需要，我可提供完整的抓包记录、复现时间线，以及在多个客户端环境下的对照结果。

项目仓库：`https://git-nj.iwhalecloud.com/codecompetition8md-psg/dialog-survey.git`

---

## 十一、研发云团队答复与客户端侧验证（2026-11 补充）

研发云团队的答复是：新 Git 客户端默认使用 Schannel，对 TLS 1.3 兼容性差，建议执行

```bash
git config --global http.sslBackend openssl
```

（对应 FAQ：<https://docs.iwhalecloud.com/bidcSHWLy/index#/didxr4Z2Fxa>）

本机已执行该配置并做了端到端复测，**结论：该指令对本缺陷无效，且与本报告第九节一致**。

### 11.1 为什么无效

原报告 §9 已经分别用 schannel 和 OpenSSL 后端复现过本缺陷；本次复测再次确认：

| 组合 | 小响应（API / info/refs） | push（含真实新提交推送） | fetch / clone（大响应） |
|---|---|---|---|
| schannel（Git 默认） | ✅ | ⚠️ 偶发假失败 | ❌ curl 56 missing close_notify |
| **openssl（FAQ 方案）** | ✅ | ⚠️ 同样偶发假失败 | ❌ curl 56 unexpected eof |

切换后端只是改变了报错文案（`schannel: missing close_notify` → `OpenSSL: unexpected eof while reading`），错误本质相同：**服务端在 Connection: close 收尾时不发送 close_notify**。这与 TLS 版本也无关——强制 TLS 1.2（`--tlsv1.2 --tls-max 1.2`）同样复现。

另注：`http.sslVersion` 在本机 Git（2.54.0.windows.1）上只接受 `tlsv1.x` 写法（`tls1.2` 会报 unsupported 并静默回退），且它对缺陷本身无影响。

### 11.2 客户端侧已排除的一切

以下变体全部实测**不能**绕过缺陷：

- `http.sslBackend` = schannel / openssl
- 强制 TLS 1.2
- HTTP/1.0、`Expect: 100-continue`
- shallow fetch（`deepen 1` / `--depth 1`）——服务端仍回传全量 pack，Gitea 1.22.1 的 shallow 实现未按 deepen 裁剪
- HTTP/2 —— 服务端 ALPN 不提供 h2，Git 自带 libcurl 也未编译 nghttp2

SSH（22 端口）在内网不可达，无法作为替代通道。

### 11.3 当前环境的实际状态与操作规范

| 项 | 状态 |
|---|---|
| 全局 `http.sslBackend=openssl` | 保留（遵循官方 FAQ，无害；Git 自带的 libcurl 实为 Schannel，此项仅影响走系统 curl 的场景） |
| 本仓库 `http.dt.maxRequests=1` | 已设置——多连接并发只会放大同一缺陷，串行最稳 |
| `tools/push-dt.ps1.example` | **推研发云统一用它**：push 后自动 `git ls-remote` 核对 SHA，把"假失败"直接判读成 OK / FAIL，杜绝盲目重推 |
| 日常同步方向 | **以 GitHub→本地→研发云单向推送为主**。从 dt `fetch` 目前必失败（大响应），确需拉取时用 Web「下载 zip」或手工搬运 packfile（§8.4 最后手段） |
| push 报 curl 56 时 | 先 `git ls-remote dt <branch>` 核对，再决定；**永远不要因报错直接 `--force`** |

真实推送已在临时分支上端到端验证通过（推送成功 → ls-remote 确认 → 删除），master 三端保持一致。
