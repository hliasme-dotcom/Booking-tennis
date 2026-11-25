// Δημιουργεί ή ενημερώνει διαχειριστή: node --env-file=.env scripts/create-admin.mjs email "Όνομα" κωδικός
import bcrypt from "bcryptjs";
import pg from "pg";

const [email, name, password] = process.argv.slice(2);
if (!email || !name || !password || password.length < 8) {
  console.error('Χρήση: create-admin.mjs email "Όνομα" κωδικός(>=8)');
  process.exit(1);
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const hash = await bcrypt.hash(password, 12);
await c.query(
  `INSERT INTO users(email, name, password_hash, role) VALUES (lower($1),$2,$3,'admin')
   ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin'`,
  [email, name, hash],
);
console.log("admin ready:", email.toLowerCase());
await c.end();
