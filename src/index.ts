// Interview Bot - Main Entry Point
// Exports core modules and initializes application

import { info } from './utils/logger.js';

export * from './server.js';
export * from './api/health.js';
export * from './api/webhook.js';
export * from './api/plans.js';
export * from './api/templates.js';
export * from './api/analysis.js';

export function main(): void {
  info('Interview Bot starting...');
}
