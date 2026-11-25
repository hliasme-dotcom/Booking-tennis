import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pool } from "./db.ts";
import { UserError } from "./errors.ts";

const COOKIE = "tb_session";
const SESSION_DAYS = 30;

export type User = { id: number; email: string; name: string; phone: string; role: "player" | "admin"; atrp: number | null; available: boolean };

const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export async function hashPassword(pw: string) {
  if (pw.length < 8) throw new UserError("Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες");
  return bcrypt.hash(pw, 12);
}

export async function startSession(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await pool().query("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1,$2,$3)", [sha(token), userId, expires]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function login(email: string, pw: string) {
  const r = await pool().query("SELECT id, password_hash FROM users WHERE email=lower($1)", [email.trim()]);
  const u = r.rows[0];
  // συγκρίνουμε πάντα ένα hash, ώστε ο χρόνος απόκρισης να μη δείχνει αν υπάρχει το email
  const ok = await bcrypt.compare(pw, u?.password_hash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!u || !ok) throw new UserError("Λάθος email ή κωδικός");
  await startSession(u.id);
}

export async function logout() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) await pool().query("DELETE FROM sessions WHERE token_hash=$1", [sha(t)]);
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  const r = await pool().query(
    `SELECT u.id, u.email, u.name, u.phone, u.role, u.atrp, u.available
       FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now()`,
    [sha(t)],
  );
  return r.rows[0] ?? null;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}
