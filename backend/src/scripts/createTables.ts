import { config } from 'dotenv';
import { setupDatabase, closeDatabase } from '../utils/database.js';
import { createLogger } from '../utils/logger.js';
import path from 'path';

config({ path: path.join(process.cwd(), '../.env') });

const logger = createLogger('CreateTables');

async function createTables() {
  try {
    logger.info('Creating database tables...');
    
    // This will create all necessary tables
    await setupDatabase();
    
    logger.info('All tables created successfully!');
    
    // Close the database connection
    await closeDatabase();
    
    process.exit(0);
  } catch (error) {
    logger.error('Failed to create tables', { error });
    process.exit(1);
  }
}

createTables();