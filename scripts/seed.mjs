// Δεδομένα επίδειξης: node --env-file=.env.local scripts/seed.mjs
import bcrypt from "bcryptjs";
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const hash = await bcrypt.hash("demo12345", 12);
const user = async (email, name, role, atrp, euros) => {
  const id = (await c.query(
    "INSERT INTO users(email,name,phone,password_hash,role,atrp) VALUES ($1,$2,'6900000000',$3,$4,$5) ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id",
    [email, name, hash, role, atrp])).rows[0].id;
  if (euros) await c.query("INSERT INTO wallet_tx(user_id, amount_cents, kind, note) VALUES ($1,$2,'topup','Αρχικό υπόλοιπο demo')", [id, euros * 100]);
  return id;
};
const admin = await user("admin@demo.gr", "Διαχειριστής", "admin", null, 0);
await user("maria@demo.gr", "Μαρία Παπαδοπούλου", "player", 3.5, 60);
await user("nikos@demo.gr", "Νίκος Γεωργίου", "player", 4.0, 40);
await user("eleni@demo.gr", "Ελένη Κωνσταντίνου", "player", 5.0, 30);

const club = async (name, area, courts) => {
  const id = (await c.query("INSERT INTO clubs(name, area) VALUES ($1,$2) RETURNING id", [name, area])).rows[0].id;
  const ids = [];
  for (const [n, indoor] of courts) ids.push((await c.query("INSERT INTO courts(club_id,name,indoor) VALUES ($1,$2,$3) RETURNING id", [id, n, indoor])).rows[0].id);
  return { id, courts: ids };
};
const a = await club("Κλαμπ Α", "Βόρεια Προάστια", [["Γήπεδο 1", true], ["Γήπεδο 2", false]]);
const b = await club("Κλαμπ Β", "Νότια Προάστια", [["Κεντρικό", false]]);
const H = 3600e3;
for (const [cl, court, inHours, price] of [[a, a.courts[0], 5, 1800], [a, a.courts[1], 26, 1500], [b, b.courts[0], 8, 2000]]) {
  const start = new Date(Math.ceil((Date.now() + inHours * H) / (15 * 60e3)) * 15 * 60e3);
  await c.query(
    `INSERT INTO offers(club_id, court_id, starts_at, court_cost_cents, price_per_player_cents, expires_at, created_by)
     VALUES ($1,$2,$3,2000,$4,$5,$6)`, [cl.id, court, start, price, new Date(start.getTime() - 45 * 60e3), admin]);
}
console.log("seeded: admin@demo.gr / maria@demo.gr / nikos@demo.gr / eleni@demo.gr, κωδικός demo12345");
await c.end();
