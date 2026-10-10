import { error as logError } from './utils/logger.js';
import { startServer } from './server.js';

/**
 * Canonical published entry point.
 *
 * This file exists so the process is launched reliably regardless of HOW it is
 * started:
 *   - `node dist/src/server-entry.js`            (direct)
 *   - PM2 fork mode                              (child_process.fork of
 *     ProcessContainerFork.js, where the argv-based self-start guard in
 *     src/server.ts cannot detect a direct launch)
 *   - container CMD, systemd, etc.
 *
 * Calling startServer() explicitly avoids two bugs that shipped in 1.11.0:
 *   - issue #186: ecosystem.config.cjs pointed at `dist/server.js`, a path that
 *     does not exist once tsc preserves the `src/` directory layout.
 *   - issue #187: under PM2 fork mode the argv === import.meta.url self-start
 *     guard is never true, so startServer() was never called and the process
 *     exited silently with code 0 in an infinite restart loop with an empty
 *     error log.
 */
void startServer().catch((err: unknown) => {
  // Surface startup failures to the error log (which PM2 captures) instead of
  // exiting silently with code 0, which previously produced an undiagnosable
  // restart loop (issue #187).
  logError('Server failed to start', {
    error: err instanceof Error ? (err.stack || err.message) : err,
  });
  process.exitCode = 1;
});
