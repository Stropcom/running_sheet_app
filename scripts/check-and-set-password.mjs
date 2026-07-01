import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';

const HASH = '$2b$12$rmZyIRq89gKUgGjK7xRFke4poGoYy13cvJ3SlUJvq8kXZoYKruy5m';
const NEW_PASSWORD = 'Strop459';

const r1 = await bcrypt.compare(NEW_PASSWORD, HASH);
console.log(`Current hash matches '${NEW_PASSWORD}':`, r1);

if (!r1) {
  console.log('Hash does not match — generating new hash and updating database...');
  const newHash = await bcrypt.hash(NEW_PASSWORD, 12);
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  await conn.execute(
    "UPDATE users SET passwordHash = ?, loginMethod = 'local' WHERE username = 'strop'",
    [newHash]
  );
  await conn.end();
  console.log('Password updated successfully for user strop.');
} else {
  console.log('Password is already correct. Ensuring loginMethod is local...');
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  await conn.execute(
    "UPDATE users SET loginMethod = 'local' WHERE username = 'strop'",
  );
  await conn.end();
  console.log('loginMethod updated to local.');
}
