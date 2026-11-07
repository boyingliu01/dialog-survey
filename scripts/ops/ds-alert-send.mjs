// 由 ds-alert.sh 通过一次性容器调用：从 stdin 读取 JSON，取 token 并发钉钉工作通知。
// 入参: { appKey, appSecret, agentId, userIds, content }
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
let p;
try {
  p = JSON.parse(Buffer.concat(chunks).toString('utf8'));
} catch {
  console.log(JSON.stringify({ ok: false, stage: 'input' }));
  process.exit(2);
}

const out = (o) => console.log(JSON.stringify(o));
try {
  // The literal below is the URL parameter NAME, not a credential -- the values
  // are interpolated from the environment.
  const tokenUrl = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(p.appKey)}&appsecret=${encodeURIComponent(p.appSecret)}`; // pragma: allowlist secret
  const tok = await fetch(tokenUrl, {
    signal: AbortSignal.timeout(10000),
  }).then((r) => r.json());
  if (!tok.access_token) {
    out({ ok: false, stage: 'token', errcode: tok.errcode, errmsg: tok.errmsg });
    process.exit(3);
  }

  const body = new URLSearchParams({
    agent_id: String(p.agentId),
    userid_list: p.userIds,
    msg: JSON.stringify({ msgtype: 'text', text: { content: p.content } }),
  });
  const res = await fetch(
    `https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=${encodeURIComponent(tok.access_token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10000),
    }
  )
    .then((r) => r.json())
    .catch((e) => ({ errcode: -1, errmsg: String(e) }));
  out({ ok: res.errcode === 0, stage: 'send', errcode: res.errcode, errmsg: res.errmsg });
  process.exit(res.errcode === 0 ? 0 : 4);
} catch (e) {
  out({ ok: false, stage: 'exception', errmsg: String(e) });
  process.exit(5);
}
