# 研发云 Gitea TLS 缺陷报告：HTTPS 响应缺少 `close_notify`

> 报告日期：2026-10-27（同日补充第十一节：对「切换 openssl sslBackend」方案的验证结论）
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

### 10.1 针对「sslBackend=openssl」方案的复测脚本（2026-10-27 补充）

在任意 Linux/WSL 或 Git Bash 下执行；**OpenSSL 后端的 curl 最能代表 FAQ 方案生效后的 Git 客户端行为**：

```bash
#!/usr/bin/env bash
REPO="https://git-nj.iwhalecloud.com/codecompetition8md-psg/dialog-survey.git"
HEAD_SHA=$(git ls-remote "$REPO" refs/heads/master | cut -f1)

# want 行必须带能力声明（真实 git 客户端总是带）。pkt-line 长度 = 4 + 行长 + 1。
CAPS="multi_ack_detailed side-band-64k ofs-delta"
LINE="want ${HEAD_SHA} ${CAPS}"
LEN=$((4 + ${#LINE} + 1))
req() { printf "%04x%s\n00000009done\n" "$LEN" "$LINE"; }

probe() { # $1 = 标签，其余 = curl 额外参数
  local label="$1"; shift
  local rc out err
  req > /tmp/probe-body.bin
  out=$(curl -sS -o /dev/null -w "http=%{http_code} size=%{size_download}" \
    -X POST -H "Content-Type: application/x-git-upload-pack-request" \
    --data-binary @/tmp/probe-body.bin "$@" "$REPO/git-upload-pack" 2>/tmp/probe-err.txt)
  rc=$?
  err=$(head -1 /tmp/probe-err.txt)
  echo "[$label] exit=$rc ${out}${err:+ | $err}"
}

probe "TLS默认（本客户端为 schannel）"
probe "强制TLS1.2"          --tlsv1.2 --tls-max 1.2
probe "HTTP/1.0"            --http1.0
probe "Expect:100-continue" -H 'Expect: 100-continue'

# OpenSSL 后端专项：若贵方验证机的 curl 是 OpenSSL 编译（curl --version 可见），
# 上面各行即等价于 git config --global http.sslBackend openssl 之后的 git fetch。
curl --version | head -1
```

预期输出形态（本机 2026-10-27 实测）：

```
[TLS默认（本客户端为 schannel）] exit=56 http=200 size=28510364 | curl: (56) schannel: server closed abruptly (missing close_notify)
[强制TLS1.2] exit=56 http=200 size=28512704 | curl: (56) schannel: server closed abruptly (missing close_notify)
[HTTP/1.0] exit=56 http=200 size=285xxxxx | curl: (56) ...
[Expect:100-continue] exit=56 http=200 size=285xxxxx | curl: (56) ...
```

每一行都是 **HTTP 200 + 全量 pack 字节数（约 28 MB）**，却伴随 exit 56 报错——**字节收全了，收尾告警没收到**。这正是缺陷的定义，且四种变体无一幸免。

> ⚠️ 复测时请确认请求体正确：pkt-line 长度字段与实际行长不符时，服务端会返回 `Content-Length: 0` 的空响应（HTTP 200、exit 0），看起来"一切正常"。这是构造错误，不是缺陷消失。本脚本的 want 行带能力声明并按真实 git 客户端格式构造，已验证可稳定触发。

---

## 十一、对「切换 openssl sslBackend」方案的验证（2026-10-27 下午补充）

### 11.0 背景：贵方答复与 FAQ 方案

针对本报告，研发云团队答复：新 Git 客户端使用 Schannel 作为 SSL/TLS 协议，对 TLS 1.3 的支持可能存在兼容性问题（版本太高），建议执行

```bash
git config --global http.sslBackend openssl
```

强制使用 OpenSSL 协议。（对应 FAQ：<https://docs.iwhalecloud.com/bidcSHWLy/index#/didxr4Z2Fxa>）

我方已按要求配置并做了完整的端到端复测。**结论：该指令对本缺陷无效**。缺陷在服务端连接收尾阶段，与客户端 SSL 后端和 TLS 版本均无关——这与本报告第九节的对照实验结论一致（当时已分别用 schannel 和 OpenSSL 后端复现）。以下为本次复测记录。

**测试环境**（与原报告 §2 相同）：Windows 11，`git 2.54.0.windows.1`；其内置 libcurl 8.19.0（Schannel 后端），系统 `curl.exe` 8.22.0（Schannel），Git 目录下另有 `libcrypto-3-x64.dll`（OpenSSL 3.5.6，供 `http.sslBackend=openssl` 使用）。

### 11.1 主实验矩阵（2026-10-27 16:45–17:20 实测）

| # | 场景 | 命令要点 | 结果 |
|---|---|---|---|
| 1 | 小响应 API | `GET /api/v1/version`（21 B） | ✅ exit 0 |
| 2 | 小响应 refs | `GET .../info/refs?service=git-upload-pack`（4,321 B） | ✅ exit 0 |
| 3 | **大响应，schannel** | `POST git-upload-pack`（want=master HEAD） | ❌ `HTTP=200 size=28549360` + `curl: (56) schannel: server closed abruptly (missing close_notify)` |
| 4 | **大响应，openssl**（FAQ 方案） | `git fetch dt`（全量协商） | ❌ `HTTP=200` 收完全部字节 + `error: RPC failed; curl 56 OpenSSL SSL_read: OpenSSL/3.5.6: error:0A000126: SSL routines::unexpected eof while reading` |
| 5 | **大响应，schannel + 强制 TLS 1.2** | `curl --tlsv1.2 --tls-max 1.2` 同一 POST | ❌ `HTTP=200 size=28553660` + 同 #3 报错 |
| 6 | 大响应 + `Expect: 100-continue` | 同一 POST | ❌ 同上 |
| 7 | 大响应 + HTTP/1.0 | `curl --http1.0` 同一 POST | ❌ 同上 |
| 8 | shallow 拉取 | pkt-line 加 `deepen 1`；及 `git fetch --depth 1` | ❌ 服务端仍回传全量 pack 后报同样错误（Gitea 1.22.1 的 shallow 实现未按 deepen 裁剪响应） |
| 9 | HTTP/2 | ALPN 探测 | — 服务端 ALPN 不提供 h2，无法走该通道 |
| 10 | SSH 替代通道 | TCP 22 端口 | — 内网不可达，无法作为规避手段 |
| 11 | **真实 push（新提交）** | 向临时分支推送 1 个新提交 | ✅ exit 0，`git ls-remote` 确认远端收到目标 SHA（随后已删除该临时分支） |
| 12 | `http.postBuffer=524288000` + `http.version=HTTP/1.1`（第二轮建议） | 本机早已生效；另用 curl 模拟其请求形态（HTTP/1.1 + Expect:100-continue）拉大响应 | ❌ `HTTP=200 size=28522829` + exit 56，详见 §11.3 |

两个关键读数：

- **#3 与 #4 是同一个错误的两种文案**。`schannel: missing close_notify` 和 `OpenSSL: unexpected eof while reading` 都指一件事：连接被直接关闭而没有 TLS 关闭告警。换后端只是换了报错的人称。
- **#5 排除了 TLS 版本因素**：强制 TLS 1.2 后依旧必现，说明问题不是「TLS 1.3 兼容性」。

补充观察：`http.sslVersion` 在 Git 2.54 上只接受 `tlsv1.x` 写法（`tls1.2` 会报 unsupported 并静默回退默认值）——若平台侧同事用 `tls1.2` 做过验证，其实际测到的仍是默认 TLS 版本，建议复核相关结论时注意这一点。

### 11.2 请贵方排查的方向（重申 §8，按本次证据收敛）

1. **openresty 代理的 TLS 关闭逻辑**（最可能根因）：大响应走 `Connection: close` 收尾，代理 `close()` 前未调用 `SSL_shutdown()` 发送 `close_notify`。小响应因单缓冲区写完走了不同代码路径，故不触发。
2. 代理层超时/中断配置（`proxy_read_timeout`、`send_timeout`、`proxy_ignore_client_abort`）。
3. 在 openresty ↔ Gitea 之间抓包，确认 `close_notify` 在哪一跳丢失。
4. 临时规避：**开通 SSH（22 端口）访问**或允许内网 HTTP——两者都能立即恢复标准 Git 工作流。

我方立场不变（§6）：严格 TLS 客户端把「无 close_notify 的断开」判为错误是 RFC 要求的正确行为，Git/curl 无法宽容处理，否则会产生静默截断风险。**这不是任何客户端的配置问题**，§11.1 的 11 组实验已穷尽客户端侧可控变量。

### 11.3 第二轮答复：`http.postBuffer` / `http.version`（2026-10-27 晚补充）

贵方第二次建议执行：

```bash
git config --global http.postBuffer 524288000
git config --global http.version HTTP/1.1
```

**实测结论：同样无效，且这两条在本机早已生效**（自首次排障起就在全局配置里，值与建议完全一致）。原理上也命中不了本缺陷：

- `http.postBuffer` 只改变**客户端上行请求体**的缓冲方式——超过该阈值时改用 chunked 上传，低于时用带 Content-Length 的一次性 POST。它不改变服务端返回响应后的收尾行为。
- 本缺陷发生在**下行响应的 TLS 关闭阶段**（§4–§6），与请求如何发出无关。
- 两条生效后 `git fetch` 依旧必现 curl 56；用 curl 直接模拟 postBuffer 生效后的请求形态（HTTP/1.1 + `Expect: 100-continue`）拉取大响应，结果不变：`HTTP=200 size=28522829` + exit 56（§10.1 脚本 #6 行即此组合）。

至此三个客户端侧方案（sslBackend、TLS 版本、postBuffer/http.version）均已按贵方指引逐一验证并排除。**请贵方按 §11.2 排查 openresty 的连接收尾逻辑**——所有证据都指向同一处：大响应 `Connection: close` 前缺少 `close_notify`。

### 11.4 传输量说明（回应"代码量不大为何传输 28 MB"）

本仓库 TS 源码仅约 1 万行，但完整历史 pack 为 **26.4 MB**，其中：

| 对象 | 大小 | 状态 |
|---|---|---|
| `assets/fonts/NotoSansCJKsc-Regular.otf` | **16.4 MB** | 仍在 HEAD（PDF 导出嵌入 CJK 字体，功能必需） |
| 两份 PDF（项目研究/规范库） | 各 ~6.5 MB | 已从工作树删除，但留在历史中 |
| 其余全部源码/测试/文档合计 | ~3 MB | — |

克隆与全量 fetch 必须传输完整历史，故必然触发大响应路径。即使做最激进的瘦身（历史重写剔除 PDF），pack 仍约 20 MB——**瘦身只是把复现概率从"必现"降到"大概率"，不能消除缺陷**（小响应阈值在 4 KB 以下才安全，见 §4）。根治仍在服务端收尾逻辑。

### 11.5 我方可提供的追加材料

- 上述 11 组实验的完整原始输出与时间戳；
- 同一时刻大小响应对照抓包（§4 的扩展版，含 TLS 记录层日志 `SSLKEYLOGFILE`）。

---

## 联系方式

如需要，我可提供完整的抓包记录、复现时间线，以及在多个客户端环境下的对照结果。

项目仓库：`https://git-nj.iwhalecloud.com/codecompetition8md-psg/dialog-survey.git`（当前 master：`6eed757`，三端一致）
