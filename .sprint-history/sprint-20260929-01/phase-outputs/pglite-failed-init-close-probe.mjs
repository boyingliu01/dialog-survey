import { PGlite } from '@electric-sql/pglite';

const garbage = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])]);
let syncThrew = null;
let pg;
try {
  pg = new PGlite({ loadDataDir: garbage });
} catch (e) {
  syncThrew = e.message;
}
console.log('ctorSyncThrew:', syncThrew ?? 'no');
if (pg) {
  try {
    await pg.waitReady;
    console.log('waitReady: RESOLVED (unexpected)');
  } catch (e) {
    console.log('waitReady: rejected ->', String(e && e.message).slice(0, 140));
  }
  const t0 = Date.now();
  let outcome;
  try {
    await Promise.race([
      pg.close().then(() => 'closed'),
      new Promise((r) => setTimeout(() => r('TIMEOUT>5s'), 5000)),
    ]).then((v) => (outcome = v));
    console.log('closeAfterFailedInit:', outcome, Date.now() - t0, 'ms');
  } catch (e) {
    console.log('closeAfterFailedInit: threw ->', String(e && e.message).slice(0, 140), Date.now() - t0, 'ms');
  }
}
process.exit(0);
