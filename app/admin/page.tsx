import AdminNav from "@/components/AdminNav.tsx";
import Flash from "@/components/Flash.tsx";
import { requireAdmin } from "@/lib/auth.ts";
import { pool } from "@/lib/db.ts";
import { adminOffers } from "@/lib/offers.ts";
import { euro, level, STATUS, time, when } from "@/lib/format.ts";
import { cancelOfferAction, createOfferAction } from "../actions.ts";

export const dynamic = "force-dynamic";

export default async function Admin({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireAdmin();
  const [clubs, courts, offers] = await Promise.all([
    pool().query("SELECT id, name FROM clubs ORDER BY name").then((r) => r.rows),
    pool().query("SELECT c.id, c.name, c.indoor, cl.name AS club FROM courts c JOIN clubs cl ON cl.id=c.club_id ORDER BY cl.name, c.name").then((r) => r.rows),
    adminOffers(),
  ]);
  return (
    <>
      <h1>Διαχείριση</h1>
      <AdminNav />
      <Flash sp={await searchParams} />

      <h2>Νέο κενό slot</h2>
      {clubs.length === 0 ? <p className="muted">Πρόσθεσε πρώτα ένα κλαμπ.</p> : (
        <form action={createOfferAction} className="card">
          <div className="fields">
            <div><label htmlFor="clubId">Κλαμπ</label>
              <select id="clubId" name="clubId" required>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label htmlFor="courtId">Γήπεδο (προαιρετικό)</label>
              <select id="courtId" name="courtId"><option value="">—</option>{courts.map((c) => <option key={c.id} value={c.id}>{c.club} · {c.name}{c.indoor ? " (κλειστό)" : ""}</option>)}</select></div>
            <div><label htmlFor="start">Έναρξη (ώρα Ελλάδας)</label><input id="start" name="start" type="datetime-local" step={900} required /></div>
            <div><label htmlFor="duration">Διάρκεια (λεπτά)</label><input id="duration" name="duration" type="number" defaultValue={75} min={30} max={240} required /></div>
            <div><label htmlFor="courtCost">Κόστος γηπέδου (€)</label><input id="courtCost" name="courtCost" type="number" step="0.5" defaultValue={20} min={0} required /></div>
            <div><label htmlFor="price">Τιμή ανά παίκτη (€)</label><input id="price" name="price" type="number" step="0.5" defaultValue={18} min={1} required /></div>
            <div><label htmlFor="expiresBefore">Λήξη προσφοράς (λεπτά πριν την έναρξη)</label><input id="expiresBefore" name="expiresBefore" type="number" defaultValue={45} min={0} required /></div>
          </div>
          <label htmlFor="note">Σημείωση για τους παίκτες</label>
          <input id="note" name="note" maxLength={300} placeholder="π.χ. φέρτε μπάλες" />
          <p><button>Δημοσίευση</button></p>
        </form>
      )}

      <h2>Slots των τελευταίων 7 ημερών και μελλοντικά</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Ώρα</th><th>Κλαμπ</th><th>Κατάσταση</th><th>Παίκτες</th><th>Τιμή / κόστος</th><th></th></tr></thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id}>
                <td>{when(o.starts_at)}<div className="muted">λήγει {time(o.expires_at)}</div></td>
                <td>{o.club_name}{o.court_name && <div className="muted">{o.court_name}</div>}</td>
                <td><span className={`badge ${o.status}`}>{STATUS[o.status]}</span>
                  {o.status === "open" && <div className="muted">{o.eligible} παίκτες ταιριάζουν</div>}</td>
                <td>{o.players.length === 0 ? <span className="muted">—</span> :
                  o.players.map((p: { id: number; name: string; atrp: number }) => <div key={p.id}>{p.name} ({level(p.atrp)})</div>)}</td>
                <td>{euro(o.price_per_player_cents)} × 2<div className="muted">γήπεδο {euro(o.court_cost_cents)}</div></td>
                <td>{(o.status === "open" || o.status === "confirmed") && (
                  <form action={cancelOfferAction}><input type="hidden" name="offerId" value={o.id} /><button className="danger">Ακύρωση</button></form>)}</td>
              </tr>
            ))}
            {offers.length === 0 && <tr><td colSpan={6} className="muted">Δεν υπάρχουν slots.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
