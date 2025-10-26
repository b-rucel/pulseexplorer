require('dotenv').config();
const { colors, rainbow, colorize } = require('../lib/colors');
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');


async function setupDatabase() {
  console.log(rainbow('═══════════════════════════════════════════════════════════'));
  console.log(colorize('                Postgres - Database Setup                  '));
  console.log(rainbow('═══════════════════════════════════════════════════════════\n'));

  try {
    const dbName = process.env.DB_NAME || 'pulsechain_explorer';

    // Check if database exists
    const result = await db.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (result.rows.length === 0) {
      console.log(`📦 Database "${dbName}" does not exist. Creating...\n`);
      await db.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Database "${dbName}" created successfully!\n`);
    } else {
      console.log(`✅ Database "${dbName}" already exists.\n`);
    }

    // Check if tables already exist
    const tableCheckQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name IN (
        'blocks', 'addresses', 'transactions', 'logs',
        'tokens', 'token_transfers', 'smart_contracts', 'internal_transactions'
      )
      ORDER BY table_name;
    `;

    const existingTables = await db.query(tableCheckQuery);

    if (existingTables.rows.length > 0) {
      console.log(colors.red + `⚠️  ${colors.bold}WARNING${colors.reset}: The following tables already exist:`);
      existingTables.rows.forEach(row => {
        console.log(colors.mint + `   - ${row.table_name}` + colors.reset);
      });

      // stop the process if tables exist
      process.exit()
    }

    // read sql file, check path
    const sqlPath = path.join(__dirname, '../sql', 'create.tables.sql');
    const sqlQuery = fs.readFileSync(sqlPath, 'utf8');
    console.log('📄 Running sql file: create.tables.sql\n');

    await db.query(sqlQuery);
    console.log(`✅ SQL completed successfully!\n`);

    await db.close();
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run setup
if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase };
