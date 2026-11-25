"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pool } from "@/lib/db.ts";
import { UserError } from "@/lib/errors.ts";
import { hashPassword, login, logout, requireAdmin, requireUser, startSession } from "@/lib/auth.ts";
import { cancelOffer, createOffer, joinOffer, leaveOffer } from "@/lib/offers.ts";
import { adjust, topUp } from "@/lib/wallet.ts";
import { athensLocalToDate, HHMMToMin } from "@/lib/format.ts";

/** Τρέχει μια ενέργεια και γυρνά στη σελίδα με μήνυμα. Μόνο τα UserError φτάνουν στον χρήστη. */
async function run(back: string, fn: () => Promise<string | void>): Promise<never> {
  let msg: string;
  let ok = true;
  try {
    msg = (await fn()) || "Έγινε";
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect του Next
    ok = false;
    if (e instanceof UserError) msg = e.message;
    else if (e instanceof z.ZodError) msg = "Έλεγξε τα στοιχεία της φόρμας";
    else {
      console.error(e);
      msg = "Κάτι πήγε στραβά. Δοκίμασε ξανά.";
    }
  }
  revalidatePath("/", "layout");
  const sep = back.includes("?") ? "&" : "?";
  redirect(`${back}${sep}${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const cents = z.coerce.number().positive().max(10000).transform((e) => Math.round(e * 100));
const id = z.coerce.number().int().positive();

// ---------- λογαριασμός ----------

export async function registerAction(f: FormData) {
  let userId = 0;
  await run("/register", async () => {
    const d = z.object({
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().toLowerCase().email().max(200),
      phone: z.string().trim().max(30),
      password: z.string().max(200),
    }).parse({ name: str(f, "name"), email: str(f, "email"), phone: str(f, "phone"), password: str(f, "password") });
    const hash = await hashPassword(d.password);
    try {
      userId = (await pool().query(
        "INSERT INTO users(email,name,phone,password_hash) VALUES ($1,$2,$3,$4) RETURNING id",
        [d.email, d.name, d.phone, hash],
      )).rows[0].id;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new UserError("Υπάρχει ήδη λογαριασμός με αυτό το email");
      throw e;
    }
    await startSession(userId);
    redirect("/me?ok=" + encodeURIComponent("Καλώς ήρθες! Δήλωσε πότε μπορείς να παίξεις."));
  });
}

export async function loginAction(f: FormData) {
  await run("/login", async () => {
    await login(str(f, "email"), str(f, "password"));
    redirect("/");
  });
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

// ---------- παίκτης ----------

export async function joinAction(f: FormData) {
  const u = await requireUser();
  await run("/", async () => {
    const r = await joinOffer(u.id, id.parse(f.get("offerId")));
    return r.confirmed
      ? "Ο αγώνας επιβεβαιώθηκε! Δες τον αντίπαλό σου στους αγώνες σου."
      : "Πλήρωσες τη θέση σου. Μόλις πληρώσει και δεύτερος παίκτης, ο αγώνας επιβεβαιώνεται.";
  });
}

export async function leaveAction(f: FormData) {
  const u = await requireUser();
  await run("/", async () => {
    await leaveOffer(u.id, id.parse(f.get("offerId")));
    return "Αποχώρησες και τα χρήματα επέστρεψαν στο πορτοφόλι σου.";
  });
}

export async function profileAction(f: FormData) {
  const u = await requireUser();
  await run("/me", async () => {
    const phone = z.string().trim().max(30).parse(str(f, "phone"));
    await pool().query("UPDATE users SET phone=$2, available=$3 WHERE id=$1", [u.id, phone, f.get("available") === "on"]);
    return "Αποθηκεύτηκε";
  });
}

export async function addAvailabilityAction(f: FormData) {
  const u = await requireUser();
  await run("/me", async () => {
    const days = f.getAll("weekday").map((d) => z.coerce.number().int().min(0).max(6).parse(d));
    if (!days.length) throw new UserError("Διάλεξε τουλάχιστον μία μέρα");
    const start = HHMMToMin(z.string().regex(/^\d\d:\d\d$/).parse(str(f, "from")));
    const end = HHMMToMin(z.string().regex(/^\d\d:\d\d$/).parse(str(f, "to")));
    if (end <= start) throw new UserError("Η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης");
    for (const d of days) {
      await pool().query("INSERT INTO availability(user_id, weekday, start_min, end_min) VALUES ($1,$2,$3,$4)", [u.id, d, start, end]);
    }
    return "Προστέθηκε";
  });
}

export async function removeAvailabilityAction(f: FormData) {
  const u = await requireUser();
  await run("/me", async () => {
    await pool().query("DELETE FROM availability WHERE id=$1 AND user_id=$2", [id.parse(f.get("id")), u.id]);
    return "Αφαιρέθηκε";
  });
}

// ---------- admin ----------

export async function createOfferAction(f: FormData) {
  const a = await requireAdmin();
  await run("/admin", async () => {
    const d = z.object({
      clubId: id,
      courtId: z.union([z.literal("").transform(() => null), id]),
      start: z.string(),
      duration: z.coerce.number().int().min(30).max(240),
      courtCost: z.coerce.number().min(0).max(10000).transform((e) => Math.round(e * 100)),
      price: cents,
      expiresBefore: z.coerce.number().int().min(0).max(24 * 60),
      note: z.string().max(300),
    }).parse({
      clubId: f.get("clubId"), courtId: str(f, "courtId"), start: str(f, "start"), duration: f.get("duration"),
      courtCost: f.get("courtCost"), price: f.get("price"), expiresBefore: f.get("expiresBefore"), note: str(f, "note"),
    });
    let startsAt: Date;
    try { startsAt = athensLocalToDate(d.start); } catch { throw new UserError("Μη έγκυρη ημερομηνία"); }
    const expiresAt = new Date(startsAt.getTime() - d.expiresBefore * 60e3);
    await createOffer(pool(), {
      clubId: d.clubId, courtId: d.courtId, startsAt, durationMin: d.duration,
      courtCostCents: d.courtCost, pricePerPlayerCents: d.price, expiresAt, note: d.note,
    }, a.id);
    return "Το slot δημοσιεύτηκε";
  });
}

export async function cancelOfferAction(f: FormData) {
  await requireAdmin();
  await run("/admin", async () => {
    await cancelOffer(id.parse(f.get("offerId")));
    return "Ακυρώθηκε και έγιναν οι επιστροφές";
  });
}

export async function topUpAction(f: FormData) {
  const a = await requireAdmin();
  await run("/admin/players", async () => {
    const userId = id.parse(f.get("userId"));
    const amount = cents.parse(f.get("amount"));
    await topUp(pool(), userId, amount, a.id, z.string().max(200).parse(str(f, "note")) || "Φόρτωση από admin");
    return "Το πορτοφόλι φορτώθηκε";
  });
}

export async function adjustAction(f: FormData) {
  const a = await requireAdmin();
  await run("/admin/players", async () => {
    const amount = Math.round(z.coerce.number().min(-10000).max(10000).parse(f.get("amount")) * 100);
    await adjust(pool(), id.parse(f.get("userId")), amount, a.id, z.string().max(200).parse(str(f, "note")));
    return "Η διόρθωση καταχωρήθηκε";
  });
}

export async function setLevelAction(f: FormData) {
  await requireAdmin();
  await run("/admin/players", async () => {
    const raw = str(f, "atrp").replace(",", ".");
    const atrp = raw === "" ? null : z.coerce.number().min(1).max(7).multipleOf(0.5).parse(raw);
    await pool().query("UPDATE users SET atrp=$2 WHERE id=$1", [id.parse(f.get("userId")), atrp]);
    return "Το επίπεδο αποθηκεύτηκε";
  });
}

export async function createClubAction(f: FormData) {
  await requireAdmin();
  await run("/admin/clubs", async () => {
    const d = z.object({ name: z.string().trim().min(2).max(100), area: z.string().trim().min(2).max(100), address: z.string().trim().max(200) })
      .parse({ name: str(f, "name"), area: str(f, "area"), address: str(f, "address") });
    await pool().query("INSERT INTO clubs(name, area, address) VALUES ($1,$2,$3)", [d.name, d.area, d.address]);
    return "Το κλαμπ προστέθηκε";
  });
}

export async function createCourtAction(f: FormData) {
  await requireAdmin();
  await run("/admin/clubs", async () => {
    const d = z.object({ clubId: id, name: z.string().trim().min(1).max(50), surface: z.enum(["hard", "clay", "grass", "carpet"]) })
      .parse({ clubId: f.get("clubId"), name: str(f, "name"), surface: str(f, "surface") });
    await pool().query("INSERT INTO courts(club_id, name, indoor, surface) VALUES ($1,$2,$3,$4)", [d.clubId, d.name, f.get("indoor") === "on", d.surface]);
    return "Το γήπεδο προστέθηκε";
  });
}
