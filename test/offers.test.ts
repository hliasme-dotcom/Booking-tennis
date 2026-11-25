// Τρέχει πάνω σε πραγματική PostgreSQL: DATABASE_URL=... npm test
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../lib/db.ts";
import { balance, topUp } from "../lib/wallet.ts";
import { createOffer, joinOffer, leaveOffer, cancelOffer, expireDue, openOffersFor } from "../lib/offers.ts";

const db = () => pool();
const H = 3600e3;
let club = 0;

async function player(name: string, atrp: number | null, euros = 0) {
  const r = await db().query("INSERT INTO users(email,name,password_hash,atrp) VALUES ($1,$2,'x',$3) RETURNING id", [`${name}@t.gr`, name, atrp]);
  const id = r.rows[0].id as number;
  if (euros) await topUp(db(), id, euros * 100, null);
  return id;
}
const offer = (o: Partial<{ start: number; expires: number; price: number }> = {}) =>
  createOffer(db(), {
    clubId: club, courtId: null,
    startsAt: new Date(Date.now() + (o.start ?? 3) * H), durationMin: 75,
    courtCostCents: 2000, pricePerPlayerCents: o.price ?? 1800,
    expiresAt: new Date(Date.now() + (o.expires ?? 1) * H),
  }, null as unknown as number);
const status = async (id: number) => (await db().query("SELECT status, level FROM offers WHERE id=$1", [id])).rows[0];

beforeEach(async () => {
  await db().query("TRUNCATE wallet_tx, offer_players, offers, sessions, availability, users, courts, clubs RESTART IDENTITY CASCADE");
  club = (await db().query("INSERT INTO clubs(name, area) VALUES ('ACE','Βόρεια') RETURNING id")).rows[0].id;
});
after(() => db().end());

test("δύο παίκτες πληρώνουν και ο αγώνας επιβεβαιώνεται", async () => {
  const a = await player("a", 3.5, 50), b = await player("b", 4.0, 50);
  const o = await offer();
  assert.deepEqual(await joinOffer(a, o), { confirmed: false });
  assert.equal((await status(o)).level, 3.5);
  assert.deepEqual(await joinOffer(b, o), { confirmed: true });
  assert.equal((await status(o)).status, "confirmed");
  assert.equal(await balance(db(), a), 3200);
  assert.equal(await balance(db(), b), 3200);
});

test("παίκτης εκτός ±0,5 δεν μπαίνει και δεν βλέπει την προσφορά", async () => {
  const a = await player("a", 3.0, 50), c = await player("c", 4.0, 50);
  const o = await offer();
  await joinOffer(a, o);
  await assert.rejects(joinOffer(c, o), /επίπεδό σου/);
  assert.equal((await openOffersFor(c, false)).length, 0);
  assert.equal(await balance(db(), c), 5000);
});

test("χωρίς αρκετό υπόλοιπο δεν γίνεται χρέωση", async () => {
  const a = await player("a", 3.0, 10);
  const o = await offer();
  await assert.rejects(joinOffer(a, o), /υπόλοιπο/);
  assert.equal(await balance(db(), a), 1000);
});

test("τρίτος παίκτης δεν μπαίνει σε γεμάτο αγώνα", async () => {
  const [a, b, c] = [await player("a", 3, 50), await player("b", 3, 50), await player("c", 3, 50)];
  const o = await offer();
  await joinOffer(a, o); await joinOffer(b, o);
  await assert.rejects(joinOffer(c, o), /δεν είναι πια διαθέσιμη/);
});

test("ταυτόχρονες πληρωμές: μόνο δύο περνούν", async () => {
  const ids = await Promise.all(["a", "b", "c", "d", "e"].map((n) => player(n, 3, 50)));
  const o = await offer();
  const res = await Promise.allSettled(ids.map((id) => joinOffer(id, o)));
  assert.equal(res.filter((r) => r.status === "fulfilled").length, 2);
  const charged = (await db().query("SELECT count(*)::int n FROM wallet_tx WHERE kind='charge'")).rows[0].n;
  assert.equal(charged, 2);
});

test("ταυτόχρονες πληρωμές του ίδιου παίκτη δεν περνούν το υπόλοιπο", async () => {
  const a = await player("a", 3, 20);
  const o1 = await offer(), o2 = await offer();
  await Promise.allSettled([joinOffer(a, o1), joinOffer(a, o2)]);
  assert.equal(await balance(db(), a), 200);
});

test("λήξη χωρίς δεύτερο παίκτη επιστρέφει τα χρήματα", async () => {
  const a = await player("a", 3, 50);
  const o = await offer();
  await joinOffer(a, o);
  await db().query("UPDATE offers SET expires_at = now() - interval '1 minute' WHERE id=$1", [o]);
  assert.equal(await expireDue(), 1);
  assert.equal((await status(o)).status, "expired");
  assert.equal(await balance(db(), a), 5000);
});

test("αποχώρηση πριν την επιβεβαίωση επιστρέφει τα χρήματα και αλλάζει το επίπεδο", async () => {
  const a = await player("a", 3, 50), b = await player("b", 5, 50);
  const o = await offer();
  await joinOffer(a, o);
  await leaveOffer(a, o);
  assert.equal(await balance(db(), a), 5000);
  assert.equal((await status(o)).level, null);
  await joinOffer(b, o);
  assert.equal((await status(o)).level, 5);
});

test("ακύρωση επιβεβαιωμένου αγώνα επιστρέφει και στους δύο", async () => {
  const a = await player("a", 3, 50), b = await player("b", 3, 50);
  const o = await offer();
  await joinOffer(a, o); await joinOffer(b, o);
  await assert.rejects(leaveOffer(a, o), /επιβεβαιωθεί/);
  await cancelOffer(o);
  assert.equal(await balance(db(), a), 5000);
  assert.equal(await balance(db(), b), 5000);
});

test("φίλτρο 'μόνο στις ώρες μου'", async () => {
  const a = await player("a", 3, 50);
  const o = await offer({ start: 3 });
  const start = (await db().query(
    `SELECT EXTRACT(dow FROM starts_at AT TIME ZONE 'Europe/Athens')::int d,
            (EXTRACT(hour FROM starts_at AT TIME ZONE 'Europe/Athens')*60 + EXTRACT(minute FROM starts_at AT TIME ZONE 'Europe/Athens'))::int m
       FROM offers WHERE id=$1`, [o])).rows[0];
  assert.equal((await openOffersFor(a, true)).length, 0);
  await db().query("INSERT INTO availability(user_id, weekday, start_min, end_min) VALUES ($1,$2,$3,$4)", [a, start.d, start.m, start.m + 1]);
  assert.equal((await openOffersFor(a, true)).length, 1);
});
