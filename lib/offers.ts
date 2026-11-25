import type pg from "pg";
import { pool, tx, type Q } from "./db.ts";
import { UserError } from "./errors.ts";
import { balance } from "./wallet.ts";

export const PLAYERS_PER_OFFER = 2;
export const LEVEL_RANGE = 0.5;

export type OfferInput = {
  clubId: number;
  courtId: number | null;
  startsAt: Date;
  durationMin: number;
  courtCostCents: number;
  pricePerPlayerCents: number;
  expiresAt: Date;
  note?: string;
};

export async function createOffer(q: Q, input: OfferInput, by: number) {
  if (!(input.startsAt.getTime() > Date.now())) throw new UserError("Η ώρα έναρξης πρέπει να είναι στο μέλλον");
  if (!(input.expiresAt.getTime() > Date.now())) throw new UserError("Η λήξη της προσφοράς πρέπει να είναι στο μέλλον");
  if (input.expiresAt > input.startsAt) throw new UserError("Η προσφορά πρέπει να λήγει πριν αρχίσει ο αγώνας");
  if (!Number.isInteger(input.pricePerPlayerCents) || input.pricePerPlayerCents <= 0) throw new UserError("Μη έγκυρη τιμή");
  if (!Number.isInteger(input.courtCostCents) || input.courtCostCents < 0) throw new UserError("Μη έγκυρο κόστος γηπέδου");
  if (input.courtId !== null) {
    const c = await q.query("SELECT 1 FROM courts WHERE id=$1 AND club_id=$2", [input.courtId, input.clubId]);
    if (!c.rowCount) throw new UserError("Το γήπεδο δεν ανήκει στο κλαμπ");
  }
  const r = await q.query(
    `INSERT INTO offers(club_id, court_id, starts_at, duration_min, court_cost_cents, price_per_player_cents, expires_at, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [input.clubId, input.courtId, input.startsAt, input.durationMin, input.courtCostCents, input.pricePerPlayerCents, input.expiresAt, input.note ?? "", by],
  );
  return r.rows[0].id as number;
}

async function refundAll(c: pg.PoolClient, offerId: number, note: string) {
  const players = await c.query("SELECT user_id, paid_cents FROM offer_players WHERE offer_id=$1", [offerId]);
  for (const p of players.rows) {
    await c.query(
      "INSERT INTO wallet_tx(user_id, amount_cents, kind, offer_id, note) VALUES ($1,$2,'refund',$3,$4)",
      [p.user_id, p.paid_cents, offerId, note],
    );
  }
}

/** Λήγει τις ανοιχτές προσφορές που δεν βρήκαν 2 παίκτες και επιστρέφει τα χρήματα. */
export async function expireDue(): Promise<number> {
  return tx(async (c) => {
    const due = await c.query(
      `SELECT id FROM offers WHERE status='open' AND (expires_at <= now() OR starts_at <= now())
       FOR UPDATE SKIP LOCKED`,
    );
    for (const o of due.rows) {
      await c.query("UPDATE offers SET status='expired' WHERE id=$1", [o.id]);
      await refundAll(c, o.id, "Επιστροφή: δεν βρέθηκε δεύτερος παίκτης");
    }
    return due.rowCount ?? 0;
  });
}

export async function joinOffer(userId: number, offerId: number) {
  await expireDue();
  return tx(async (c) => {
    const o = (await c.query("SELECT * FROM offers WHERE id=$1 FOR UPDATE", [offerId])).rows[0];
    if (!o) throw new UserError("Η προσφορά δεν βρέθηκε");
    if (o.status !== "open") throw new UserError("Η προσφορά δεν είναι πια διαθέσιμη");
    // κλειδώνουμε τον παίκτη ώστε δύο ταυτόχρονες πληρωμές να μην περάσουν το υπόλοιπο
    const u = (await c.query("SELECT id, atrp FROM users WHERE id=$1 FOR UPDATE", [userId])).rows[0];
    if (!u) throw new UserError("Ο χρήστης δεν βρέθηκε");
    if (u.atrp === null) throw new UserError("Χρειάζεσαι επίπεδο ATRP για να μπεις σε αγώνα. Μίλησε με την ομάδα μας.");
    const players = (await c.query("SELECT user_id FROM offer_players WHERE offer_id=$1", [offerId])).rows;
    if (players.some((p) => p.user_id === userId)) throw new UserError("Είσαι ήδη σε αυτόν τον αγώνα");
    if (players.length >= PLAYERS_PER_OFFER) throw new UserError("Ο αγώνας γέμισε");
    if (o.level !== null && Math.abs(u.atrp - o.level) > LEVEL_RANGE + 1e-9) {
      throw new UserError("Το επίπεδό σου δεν ταιριάζει με τον παίκτη που περιμένει");
    }
    const price = o.price_per_player_cents as number;
    if ((await balance(c, userId)) < price) throw new UserError("Δεν φτάνει το υπόλοιπο του πορτοφολιού σου");

    await c.query(
      "INSERT INTO wallet_tx(user_id, amount_cents, kind, offer_id, note) VALUES ($1,$2,'charge',$3,'Αγώνας last-minute')",
      [userId, -price, offerId],
    );
    await c.query("INSERT INTO offer_players(offer_id, user_id, paid_cents) VALUES ($1,$2,$3)", [offerId, userId, price]);
    const full = players.length + 1 >= PLAYERS_PER_OFFER;
    await c.query(
      `UPDATE offers SET level = COALESCE(level, $2),
              status = CASE WHEN $3 THEN 'confirmed' ELSE status END,
              confirmed_at = CASE WHEN $3 THEN now() ELSE confirmed_at END
        WHERE id=$1`,
      [offerId, u.atrp, full],
    );
    return { confirmed: full };
  });
}

/** Ο παίκτης αποχωρεί πριν βρεθεί δεύτερος. Μετά την επιβεβαίωση δεν επιτρέπεται. */
export async function leaveOffer(userId: number, offerId: number) {
  return tx(async (c) => {
    const o = (await c.query("SELECT * FROM offers WHERE id=$1 FOR UPDATE", [offerId])).rows[0];
    if (!o) throw new UserError("Η προσφορά δεν βρέθηκε");
    if (o.status !== "open") throw new UserError("Ο αγώνας έχει ήδη επιβεβαιωθεί ή κλείσει");
    const p = (await c.query("DELETE FROM offer_players WHERE offer_id=$1 AND user_id=$2 RETURNING paid_cents", [offerId, userId])).rows[0];
    if (!p) throw new UserError("Δεν είσαι σε αυτόν τον αγώνα");
    await c.query(
      "INSERT INTO wallet_tx(user_id, amount_cents, kind, offer_id, note) VALUES ($1,$2,'refund',$3,'Επιστροφή: αποχώρηση')",
      [userId, p.paid_cents, offerId],
    );
    // το εύρος επιπέδου ακολουθεί όποιον έμεινε
    await c.query(
      `UPDATE offers SET level = (SELECT u.atrp FROM offer_players op JOIN users u ON u.id=op.user_id WHERE op.offer_id=$1 LIMIT 1)
        WHERE id=$1`,
      [offerId],
    );
  });
}

export async function cancelOffer(offerId: number) {
  return tx(async (c) => {
    const o = (await c.query("SELECT status FROM offers WHERE id=$1 FOR UPDATE", [offerId])).rows[0];
    if (!o) throw new UserError("Η προσφορά δεν βρέθηκε");
    if (o.status === "cancelled" || o.status === "expired") throw new UserError("Η προσφορά έχει ήδη κλείσει");
    await c.query("UPDATE offers SET status='cancelled' WHERE id=$1", [offerId]);
    await refundAll(c, offerId, "Επιστροφή: ακύρωση από το κλαμπ");
  });
}

const OFFER_COLS = `o.*, cl.name AS club_name, cl.area, ct.name AS court_name, ct.indoor,
  (SELECT count(*) FROM offer_players op WHERE op.offer_id=o.id)::int AS player_count`;

/** Ανοιχτές προσφορές που μπορεί να πάρει ο παίκτης (επίπεδο ±0,5), προαιρετικά μόνο στις ώρες του. */
export async function openOffersFor(userId: number, onlyMyHours: boolean) {
  await expireDue();
  const r = await pool().query(
    `SELECT ${OFFER_COLS},
            EXISTS (SELECT 1 FROM offer_players op WHERE op.offer_id=o.id AND op.user_id=$1) AS joined
       FROM offers o JOIN clubs cl ON cl.id=o.club_id LEFT JOIN courts ct ON ct.id=o.court_id, users u
      WHERE u.id=$1 AND o.status='open'
        AND (o.level IS NULL OR (u.atrp IS NOT NULL AND abs(u.atrp - o.level) <= ${LEVEL_RANGE}))
        AND (NOT $2 OR EXISTS (
              SELECT 1 FROM availability a WHERE a.user_id=u.id
                 AND a.weekday = EXTRACT(dow FROM o.starts_at AT TIME ZONE 'Europe/Athens')
                 AND (EXTRACT(hour FROM o.starts_at AT TIME ZONE 'Europe/Athens')*60
                      + EXTRACT(minute FROM o.starts_at AT TIME ZONE 'Europe/Athens')) >= a.start_min
                 AND (EXTRACT(hour FROM o.starts_at AT TIME ZONE 'Europe/Athens')*60
                      + EXTRACT(minute FROM o.starts_at AT TIME ZONE 'Europe/Athens')) < a.end_min))
      ORDER BY o.starts_at`,
    [userId, onlyMyHours],
  );
  return r.rows;
}

/** Οι αγώνες του παίκτη. Το όνομα του αντιπάλου φαίνεται μόνο μετά την επιβεβαίωση. */
export async function myMatches(userId: number) {
  await expireDue();
  const r = await pool().query(
    `SELECT ${OFFER_COLS},
            CASE WHEN o.status='confirmed' THEN
              (SELECT u2.name FROM offer_players op2 JOIN users u2 ON u2.id=op2.user_id
                WHERE op2.offer_id=o.id AND op2.user_id<>$1 LIMIT 1) END AS opponent,
            CASE WHEN o.status='confirmed' THEN
              (SELECT u2.phone FROM offer_players op2 JOIN users u2 ON u2.id=op2.user_id
                WHERE op2.offer_id=o.id AND op2.user_id<>$1 LIMIT 1) END AS opponent_phone
       FROM offers o JOIN offer_players me ON me.offer_id=o.id AND me.user_id=$1
       JOIN clubs cl ON cl.id=o.club_id LEFT JOIN courts ct ON ct.id=o.court_id
      ORDER BY o.starts_at DESC LIMIT 50`,
    [userId],
  );
  return r.rows;
}

export async function adminOffers(days = 7) {
  await expireDue();
  const r = await pool().query(
    `SELECT ${OFFER_COLS},
            COALESCE((SELECT json_agg(json_build_object('id',u.id,'name',u.name,'atrp',u.atrp) ORDER BY op.joined_at)
               FROM offer_players op JOIN users u ON u.id=op.user_id WHERE op.offer_id=o.id), '[]') AS players,
            (SELECT count(*) FROM users u WHERE u.role='player' AND u.available AND u.atrp IS NOT NULL
               AND (o.level IS NULL OR abs(u.atrp - o.level) <= ${LEVEL_RANGE}))::int AS eligible
       FROM offers o JOIN clubs cl ON cl.id=o.club_id LEFT JOIN courts ct ON ct.id=o.court_id
      WHERE o.starts_at >= now() - make_interval(days => $1)
      ORDER BY o.starts_at DESC`,
    [days],
  );
  return r.rows;
}

/** Έσοδα, κόστος γηπέδων και περιθώριο από επιβεβαιωμένους αγώνες, ανά κλαμπ. */
export async function report(fromDays = 30) {
  const r = await pool().query(
    `SELECT cl.name AS club_name,
            count(*) FILTER (WHERE o.status='confirmed')::int AS confirmed,
            count(*) FILTER (WHERE o.status='expired')::int AS expired,
            count(*)::int AS posted,
            COALESCE(sum(o.price_per_player_cents * ${PLAYERS_PER_OFFER}) FILTER (WHERE o.status='confirmed'),0)::bigint AS revenue,
            COALESCE(sum(o.court_cost_cents) FILTER (WHERE o.status='confirmed'),0)::bigint AS court_cost
       FROM offers o JOIN clubs cl ON cl.id=o.club_id
      WHERE o.starts_at >= now() - make_interval(days => $1)
      GROUP BY cl.name ORDER BY cl.name`,
    [fromDays],
  );
  return r.rows;
}
