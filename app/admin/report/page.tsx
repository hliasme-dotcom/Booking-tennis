import AdminNav from "@/components/AdminNav.tsx";
import { requireAdmin } from "@/lib/auth.ts";
import { report } from "@/lib/offers.ts";
import { euro } from "@/lib/format.ts";

export const dynamic = "force-dynamic";

export default async function Report() {
  await requireAdmin();
  const rows = await report(30);
  const t = rows.reduce((a, r) => ({ posted: a.posted + r.posted, confirmed: a.confirmed + r.confirmed, revenue: a.revenue + r.revenue, cost: a.cost + r.court_cost }),
    { posted: 0, confirmed: 0, revenue: 0, cost: 0 });
  return (
    <>
      <h1>Αναφορά τελευταίων 30 ημερών</h1>
      <AdminNav />
      <div className="grid">
        <div className="card"><div className="muted">Slots που γέμισαν</div><div className="big">{t.confirmed} / {t.posted}</div></div>
        <div className="card"><div className="muted">Έσοδα από παίκτες</div><div className="big">{euro(t.revenue)}</div></div>
        <div className="card"><div className="muted">Περιθώριο μετά τα γήπεδα</div><div className="big">{euro(t.revenue - t.cost)}</div></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Κλαμπ</th><th>Δόθηκαν</th><th>Γέμισαν</th><th>Έληξαν</th><th>Έσοδα</th><th>Κόστος γηπέδων</th><th>Περιθώριο</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.club_name}>
                <td>{r.club_name}</td><td>{r.posted}</td><td>{r.confirmed}</td><td>{r.expired}</td>
                <td>{euro(r.revenue)}</td><td>{euro(r.court_cost)}</td><td>{euro(r.revenue - r.court_cost)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">Δεν υπάρχουν δεδομένα.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted">Τα ποσά είναι με ΦΠΑ, όπως τα πληρώνουν οι παίκτες.</p>
    </>
  );
}
