import { startServer } from '../../src/server.js';

// .env carries production DingTalk credentials; the stream client connects on
// boot when they are present, so strip them before startServer() to keep this
// check local-only.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('DINGTALK_')) delete process.env[key];
}
process.env['PORT'] = '4103';
process.env['HOST'] = '127.0.0.1';

const app = await startServer();
console.log('LIVE_CHECK_LISTENING', app.listening, app.server.address()?.toString());
