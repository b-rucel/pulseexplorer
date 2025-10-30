require('dotenv').config();
const readline = require('readline');
const { colors, rainbow, colorize } = require('../lib/colors');
const { Database } = require('../lib/db');
const config = require('../lib/config');


async function resetDatabase() {
  console.log(`⚠️ ⛔️⛔️  ${colors.bold}${colors.crimson}WARNING: This will DROP the entire database and all data!${colors.reset}  ⛔️⛔️⚠️\n`);

  // confirm with user
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const confirmed = await new Promise((resolve) => {
    rl.question(colors.amber + 'Are you sure you want to continue? (yes/no): ' + colors.reset, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });

  if (!confirmed) {
    console.log('\n❌ Database reset cancelled.\n');
    return;
  }

  try {
    const dbName = config.db.database;
    
    // connect to 'postgres' database for admin operations
    const adminDb = new Database('postgres');

    console.log(`\n🗑️  ${colors.aqua}Dropping database "${dbName}"...${colors.reset}\n`);

    // Terminate existing connections
    await adminDb.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid();
    `, [dbName]);

    // Drop database
    await adminDb.query(`DROP DATABASE IF EXISTS ${dbName}`);

    console.log(rainbow(`✅ Database "${dbName}" dropped successfully!\n`));
    await adminDb.close();
  } catch (error) {
    console.error('❌ Reset failed:', error.message);
    console.error(error);
    await adminDb.close();
    process.exit(1);
  }
}

// Run reset
if (require.main === module) {
  resetDatabase();
}

module.exports = { resetDatabase };
