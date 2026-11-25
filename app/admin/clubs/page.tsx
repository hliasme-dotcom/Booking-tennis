import AdminNav from "@/components/AdminNav.tsx";
import Flash from "@/components/Flash.tsx";
import { requireAdmin } from "@/lib/auth.ts";
import { pool } from "@/lib/db.ts";
import { createClubAction, createCourtAction } from "../../actions.ts";

export const dynamic = "force-dynamic";

const SURFACE: Record<string, string> = { hard: "Σκληρό", clay: "Χωμάτινο", grass: "Χόρτο", carpet: "Συνθετικό" };

export default async function Clubs({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireAdmin();
  const clubs = (await pool().query(
    `SELECT cl.*, COALESCE(json_agg(json_build_object('id',c.id,'name',c.name,'indoor',c.indoor,'surface',c.surface) ORDER BY c.name)
              FILTER (WHERE c.id IS NOT NULL), '[]') AS courts
       FROM clubs cl LEFT JOIN courts c ON c.club_id=cl.id GROUP BY cl.id ORDER BY cl.name`,
  )).rows;
  return (
    <>
      <h1>Κλαμπ &amp; γήπεδα</h1>
      <AdminNav />
      <Flash sp={await searchParams} />
      <div className="grid">
        {clubs.map((cl) => (
          <div className="card" key={cl.id}>
            <strong>{cl.name}</strong><div className="muted">{cl.area}{cl.address && ` · ${cl.address}`}</div>
            <ul>{cl.courts.map((c: { id: number; name: string; indoor: boolean; surface: string }) =>
              <li key={c.id}>{c.name} · {c.indoor ? "Κλειστό" : "Ανοιχτό"} · {SURFACE[c.surface]}</li>)}</ul>
            <form action={createCourtAction}>
              <input type="hidden" name="clubId" value={cl.id} />
              <div className="fields">
                <div><label>Νέο γήπεδο</label><input name="name" placeholder="π.χ. Γήπεδο 3" required /></div>
                <div><label>Επιφάνεια</label><select name="surface">{Object.entries(SURFACE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              <label className="check"><input type="checkbox" name="indoor" /> Κλειστό</label>
              <p><button className="secondary">Προσθήκη γηπέδου</button></p>
            </form>
          </div>
        ))}
      </div>
      <h2>Νέο κλαμπ</h2>
      <form action={createClubAction} className="card">
        <div className="fields">
          <div><label htmlFor="name">Όνομα</label><input id="name" name="name" required /></div>
          <div><label htmlFor="area">Περιοχή</label><input id="area" name="area" required placeholder="π.χ. Βόρεια Προάστια" /></div>
          <div><label htmlFor="address">Διεύθυνση</label><input id="address" name="address" /></div>
        </div>
        <p><button>Προσθήκη κλαμπ</button></p>
      </form>
    </>
  );
}
