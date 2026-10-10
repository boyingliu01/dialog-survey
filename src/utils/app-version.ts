import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedVersion: string | undefined;

/**
 * Resolve the application version from the published VERSION file (when present
 * in the package) or, as a fallback, from package.json. Both ship with the npm
 * package, so a deployed instance can always report which release it is running
 * — addressing issue #191, where the published tarball carried no version
 * information and the tag had drifted off the master line.
 *
 * The candidate paths cover both layouts: sources run from `src/...` in dev/test
 * and the compiled output lives under `dist/src/...` in the published package,
 * so the relative depth to the package root differs.
 */
export function getAppVersion(): string {
  if (cachedVersion !== undefined) {
    return cachedVersion;
  }

  const startDir = dirname(fileURLToPath(import.meta.url));
  let version = 'unknown';

  for (const rel of ['VERSION', '../../VERSION', '../../../VERSION', '../../../../VERSION']) {
    const candidate = join(startDir, rel);
    if (!existsSync(candidate)) continue;
    try {
      version = readFileSync(candidate, 'utf-8').trim();
      break;
    } catch {
      // unreadable — keep looking
    }
  }

  if (version === 'unknown') {
    for (const rel of [
      'package.json',
      '../../package.json',
      '../../../package.json',
      '../../../../package.json',
    ]) {
      const candidate = join(startDir, rel);
      if (!existsSync(candidate)) continue;
      try {
        const pkg = JSON.parse(readFileSync(candidate, 'utf-8')) as { version?: unknown };
        if (typeof pkg.version === 'string') {
          version = pkg.version;
          break;
        }
      } catch {
        // unreadable — keep looking
      }
    }
  }

  cachedVersion = version;
  return version;
}
