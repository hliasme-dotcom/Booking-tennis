import AdminNav from "@/components/AdminNav.tsx";
import Flash from "@/components/Flash.tsx";
import { requireAdmin } from "@/lib/auth.ts";
import { pool } from "@/lib/db.ts";
import { euro } from "@/lib/format.ts";
import { adjustAction, setLevelAction, topUpAction } from "../../actions.ts";

export const dynamic = "force-dynamic";

export default async function Players({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; q?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const players = (await pool().query(
    `SELECT u.id, u.name, u.email, u.phone, u.atrp, u.available,
            COALESCE((SELECT sum(amount_cents) FROM wallet_tx w WHERE w.user_id=u.id),0)::bigint AS balance,
            (SELECT count(*) FROM offer_players op JOIN offers o ON o.id=op.offer_id WHERE op.user_id=u.id AND o.status='confirmed')::int AS matches
       FROM users u WHERE u.role='player' AND ($1 = '' OR u.name ILIKE '%'||$1||'%' OR u.email ILIKE '%'||$1||'%')
      ORDER BY u.name LIMIT 200`,
    [q],
  )).rows;
  return (
    <>
      <h1>Παίκτες &amp; πορτοφόλια</h1>
      <AdminNav />
      <Flash sp={sp} />
      <form className="row" style={{ marginBottom: 12 }}>
        <input name="q" defaultValue={q} placeholder="Αναζήτηση με όνομα ή email" style={{ flex: 1 }} />
        <button className="secondary">Αναζήτηση</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Παίκτης</th><th>ATRP</th><th>Υπόλοιπο</th><th>Φόρτωση / διόρθωση</th></tr></thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td>{p.name}<div className="muted">{p.email}{p.phone && ` · ${p.phone}`}</div>
                  <div className="muted">{p.matches} αγώνες{p.available ? "" : " · δεν θέλει προτάσεις"}</div></td>
                <td>
                  <form action={setLevelAction} className="row">
                    <input type="hidden" name="userId" value={p.id} />
                    <input name="atrp" defaultValue={p.atrp ?? ""} inputMode="decimal" style={{ width: 70 }} aria-label="ATRP" />
                    <button className="secondary">OK</button>
                  </form>
                </td>
                <td><strong>{euro(p.balance)}</strong></td>
                <td>
                  <form action={topUpAction} className="row">
                    <input type="hidden" name="userId" value={p.id} />
                    <input name="amount" type="number" step="0.5" min="0.5" placeholder="€" required style={{ width: 80 }} aria-label="Ποσό" />
                    <input name="note" placeholder="π.χ. μετρητά" style={{ width: 130 }} aria-label="Σημείωση" />
                    <button>Φόρτωση</button>
                  </form>
                  <details>
                    <summary className="muted">Διόρθωση</summary>
                    <form action={adjustAction} className="row">
                      <input type="hidden" name="userId" value={p.id} />
                      <input name="amount" type="number" step="0.01" placeholder="± €" required style={{ width: 80 }} aria-label="Ποσό διόρθωσης" />
                      <input name="note" placeholder="Αιτιολογία" required style={{ width: 160 }} aria-label="Αιτιολογία" />
                      <button className="secondary">Καταχώρηση</button>
                    </form>
                  </details>
                </td>
              </tr>
            ))}
            {players.length === 0 && <tr><td colSpan={4} className="muted">Κανένας παίκτης.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
