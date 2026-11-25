import type { Q } from "./db.ts";
import { UserError } from "./errors.ts";

export async function balance(q: Q, userId: number): Promise<number> {
  const r = await q.query("SELECT COALESCE(SUM(amount_cents),0)::bigint AS b FROM wallet_tx WHERE user_id=$1", [userId]);
  return r.rows[0].b;
}

export async function topUp(q: Q, userId: number, cents: number, by: number | null, note = "") {
  if (!Number.isInteger(cents) || cents <= 0) throw new UserError("Μη έγκυρο ποσό");
  await q.query(
    "INSERT INTO wallet_tx(user_id, amount_cents, kind, note, created_by) VALUES ($1,$2,'topup',$3,$4)",
    [userId, cents, note, by],
  );
}

export async function adjust(q: Q, userId: number, cents: number, by: number, note: string) {
  if (!Number.isInteger(cents) || cents === 0) throw new UserError("Μη έγκυρο ποσό");
  if (!note.trim()) throw new UserError("Η διόρθωση χρειάζεται αιτιολογία");
  await q.query(
    "INSERT INTO wallet_tx(user_id, amount_cents, kind, note, created_by) VALUES ($1,$2,'adjust',$3,$4)",
    [userId, cents, note, by],
  );
}

export async function history(q: Q, userId: number) {
  const r = await q.query(
    `SELECT w.*, c.name AS club_name, o.starts_at
       FROM wallet_tx w LEFT JOIN offers o ON o.id=w.offer_id LEFT JOIN clubs c ON c.id=o.club_id
      WHERE w.user_id=$1 ORDER BY w.created_at DESC, w.id DESC LIMIT 100`,
    [userId],
  );
  return r.rows;
}
