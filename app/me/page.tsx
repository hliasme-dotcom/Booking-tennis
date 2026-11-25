import Flash from "@/components/Flash.tsx";
import { requireUser } from "@/lib/auth.ts";
import { pool } from "@/lib/db.ts";
import { balance, history } from "@/lib/wallet.ts";
import { euro, level, minToHHMM, WEEKDAYS, when } from "@/lib/format.ts";
import { addAvailabilityAction, profileAction, removeAvailabilityAction } from "../actions.ts";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { topup: "Φόρτωση", charge: "Αγώνας", refund: "Επιστροφή", adjust: "Διόρθωση" };

export default async function Me({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const u = await requireUser();
  const [bal, tx, hours] = await Promise.all([
    balance(pool(), u.id),
    history(pool(), u.id),
    pool().query("SELECT * FROM availability WHERE user_id=$1 ORDER BY weekday, start_min", [u.id]).then((r) => r.rows),
  ]);
  return (
    <>
      <h1>Ο λογαριασμός μου</h1>
      <Flash sp={await searchParams} />
      <div className="grid">
        <div className="card">
          <div className="muted">Υπόλοιπο πορτοφολιού</div>
          <div className="big">{euro(bal)}</div>
          <p className="muted">Η φόρτωση με κάρτα (Viva) έρχεται σύντομα. Μέχρι τότε φορτώνεις μέσω της ομάδας μας.</p>
        </div>
        <div className="card">
          <div className="muted">Επίπεδο ATRP</div>
          <div className="big">{level(u.atrp)}</div>
          <p className="muted">Σου προτείνουμε αγώνες με παίκτες ±0,5 από το επίπεδό σου.</p>
        </div>
      </div>

      <h2>Πότε μπορώ να παίξω</h2>
      <div className="card">
        {hours.length === 0 ? <p className="muted">Δεν έχεις δηλώσει ώρες ακόμα.</p> : (
          <ul>
            {hours.map((h) => (
              <li key={h.id}>
                {WEEKDAYS[h.weekday]} {minToHHMM(h.start_min)}–{minToHHMM(h.end_min)}{" "}
                <form action={removeAvailabilityAction} className="inline"><input type="hidden" name="id" value={h.id} /><button className="link">αφαίρεση</button></form>
              </li>
            ))}
          </ul>
        )}
        <form action={addAvailabilityAction}>
          <label>Μέρες</label>
          <div className="days">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <label key={d} className="check"><input type="checkbox" name="weekday" value={d} /> {WEEKDAYS[d]}</label>
            ))}
          </div>
          <div className="fields">
            <div><label htmlFor="from">Από</label><input id="from" name="from" type="time" defaultValue="19:00" step={900} required /></div>
            <div><label htmlFor="to">Έως</label><input id="to" name="to" type="time" defaultValue="23:00" step={900} required /></div>
          </div>
          <p><button>Προσθήκη ωρών</button></p>
        </form>
      </div>

      <h2>Στοιχεία</h2>
      <form action={profileAction} className="card">
        <div className="muted">{u.name} · {u.email}</div>
        <label htmlFor="phone">Κινητό (το βλέπει μόνο ο αντίπαλός σου, μετά την επιβεβαίωση)</label>
        <input id="phone" name="phone" type="tel" defaultValue={u.phone} />
        <label className="check"><input type="checkbox" name="available" defaultChecked={u.available} /> Θέλω να μου προτείνετε αγώνες last-minute</label>
        <p><button>Αποθήκευση</button></p>
      </form>

      <h2>Κινήσεις πορτοφολιού</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Ημερομηνία</th><th>Κίνηση</th><th>Ποσό</th></tr></thead>
          <tbody>
            {tx.map((t) => (
              <tr key={t.id}>
                <td>{when(t.created_at)}</td>
                <td>{KIND[t.kind]}{t.club_name && ` · ${t.club_name}, ${when(t.starts_at)}`}{t.note && <div className="muted">{t.note}</div>}</td>
                <td>{euro(t.amount_cents)}</td>
              </tr>
            ))}
            {tx.length === 0 && <tr><td colSpan={3} className="muted">Καμία κίνηση ακόμα.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
