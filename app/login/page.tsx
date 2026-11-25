import Link from "next/link";
import Flash from "@/components/Flash.tsx";
import { loginAction } from "../actions.ts";

export default async function Login({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  return (
    <div className="narrow">
      <h1>Σύνδεση</h1>
      <Flash sp={await searchParams} />
      <form action={loginAction} className="card">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Κωδικός</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <p><button>Σύνδεση</button></p>
      </form>
      <p className="muted">Δεν έχεις λογαριασμό; <Link href="/register">Εγγραφή</Link></p>
    </div>
  );
}
