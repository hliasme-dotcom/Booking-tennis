import Link from "next/link";
import Flash from "@/components/Flash.tsx";
import { currentUser } from "@/lib/auth.ts";
import { pool } from "@/lib/db.ts";
import { myMatches, openOffersFor } from "@/lib/offers.ts";
import { balance } from "@/lib/wallet.ts";
import { euro, level, STATUS, time, when } from "@/lib/format.ts";
import { joinAction, leaveAction } from "./actions.ts";

export const dynamic = "force-dynamic";

type SP = Promise<{ ok?: string; err?: string; all?: string }>;

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const u = await currentUser();
  if (!u) {
    return (
      <div className="narrow">
        <h1>Παίξε τένις απόψε, σε τιμή last-minute</h1>
        <p>Τα κλαμπ μάς δίνουν τα γήπεδα που μένουν άδεια. Εμείς σου βρίσκουμε αντίπαλο στο επίπεδό σου. Πληρώνεις από το πορτοφόλι σου και ο αγώνας κλείνει μόλις πληρώσει και ο δεύτερος.</p>
        <p><Link className="btn" href="/register">Φτιάξε λογαριασμό</Link> <Link href="/login">ή συνδέσου</Link></p>
      </div>
    );
  }
  const onlyMine = sp.all !== "1";
  const [offers, matches, bal, hasHours] = await Promise.all([
    openOffersFor(u.id, onlyMine),
    myMatches(u.id),
    balance(pool(), u.id),
    pool().query("SELECT 1 FROM availability WHERE user_id=$1 LIMIT 1", [u.id]).then((r) => !!r.rowCount),
  ]);
  const upcoming = matches.filter((m) => new Date(m.starts_at) > new Date() && (m.status === "confirmed" || m.status === "open"));

  return (
    <>
      <Flash sp={sp} />
      <div className="row">
        <h1>Γεια σου, {u.name.split(" ")[0]}</h1>
        <div className="muted">Πορτοφόλι: <strong>{euro(bal)}</strong>{u.atrp !== null && <> · ATRP {level(u.atrp)}</>}</div>
      </div>
      {u.atrp === null && <p className="flash err">Δεν έχεις ακόμα επίπεδο ATRP, οπότε δεν μπορείς να μπεις σε αγώνα. Η ομάδα μας θα σου ορίσει επίπεδο.</p>}

      {upcoming.length > 0 && (
        <>
          <h2>Οι επόμενοι αγώνες μου</h2>
          <div className="grid">
            {upcoming.map((m) => (
              <div className="card" key={m.id}>
                <div className="row"><strong>{when(m.starts_at)}</strong><span className={`badge ${m.status}`}>{STATUS[m.status]}</span></div>
                <div>{m.club_name}{m.court_name && ` · ${m.court_name}`}</div>
                {m.status === "confirmed" ? (
                  <p>Αντίπαλος: <strong>{m.opponent}</strong>{m.opponent_phone && <> · <a href={`tel:${m.opponent_phone}`}>{m.opponent_phone}</a></>}</p>
                ) : (
                  <>
                    <p className="muted">Περιμένουμε δεύτερο παίκτη μέχρι τις {time(m.expires_at)}. Αν δεν βρεθεί, παίρνεις πίσω τα χρήματα.</p>
                    <form action={leaveAction}><input type="hidden" name="offerId" value={m.id} /><button className="secondary">Αποχώρηση με επιστροφή</button></form>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Ελεύθερα γήπεδα για σένα</h2>
      <div className="tabs">
        {onlyMine ? <strong>Στις ώρες μου</strong> : <Link href="/">Στις ώρες μου</Link>}
        {onlyMine ? <Link href="/?all=1">Όλες οι ώρες</Link> : <strong>Όλες οι ώρες</strong>}
      </div>
      {onlyMine && !hasHours && <p className="muted">Δεν έχεις δηλώσει ώρες. <Link href="/me">Δήλωσε πότε μπορείς να παίξεις</Link> ή δες όλες τις ώρες.</p>}
      {offers.filter((o) => !o.joined).length === 0 ? (
        <p className="muted">Δεν υπάρχει ελεύθερο γήπεδο αυτή τη στιγμή. Θα εμφανιστούν εδώ μόλις τα δώσουν τα κλαμπ.</p>
      ) : (
        <div className="grid">
          {offers.filter((o) => !o.joined).map((o) => (
            <div className="card" key={o.id}>
              <div className="row"><strong>{when(o.starts_at)}</strong><span className="big">{euro(o.price_per_player_cents)}</span></div>
              <div>{o.club_name} · {o.area}</div>
              <div className="muted">{o.court_name ? `${o.court_name} · ` : ""}{o.indoor ? "Κλειστό" : "Ανοιχτό"} · {o.duration_min}′</div>
              <p className="muted">
                {o.player_count === 0 ? "Γίνε ο πρώτος παίκτης." : `Ένας παίκτης επιπέδου ${level(o.level)} περιμένει αντίπαλο.`}
                {" "}Λήγει {time(o.expires_at)}.
              </p>
              {o.note && <p>{o.note}</p>}
              <form action={joinAction}>
                <input type="hidden" name="offerId" value={o.id} />
                <button disabled={u.atrp === null || bal < o.price_per_player_cents}>
                  {bal < o.price_per_player_cents ? "Δεν φτάνει το υπόλοιπο" : `Πληρωμή ${euro(o.price_per_player_cents)} από το πορτοφόλι`}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
