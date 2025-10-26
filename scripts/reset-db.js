require('dotenv').config();
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { colors, rainbow, colorize } = require('../lib/colors');
const db = require('../lib/db');


async function resetDatabase() {
  console.log('⚠️ ⛔️⛔️  WARNING: This will DROP the entire database and all data! ⛔️⛔️⚠️\n');

  // Confirm with user
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const confirmed = await new Promise((resolve) => {
    rl.question('Are you sure you want to continue? (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });

  if (!confirmed) {
    console.log('\n❌ Database reset cancelled.\n');
    return;
  }

  try {
    const dbName = process.env.DB_NAME || 'pulsechain_explorer';

    console.log(`\n🗑️  Dropping database "${dbName}"...`);

    // Terminate existing connections
    await db.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid();
    `, [dbName]);

    // Drop database
    await db.query(`DROP DATABASE IF EXISTS ${dbName}`);

    console.log(`✅ Database "${dbName}" dropped successfully!\n`);
    await db.close();
  } catch (error) {
    console.error('❌ Reset failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run reset
if (require.main === module) {
  resetDatabase();
}

module.exports = { resetDatabase };
