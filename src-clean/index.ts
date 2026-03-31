import 'dotenv/config';
import { startServer } from './server.js';

async function main(): Promise<void> {
  try {
    console.log('🚀 Interview Bot API starting...');
    await startServer();
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

main();
