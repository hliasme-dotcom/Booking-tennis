import Link from "next/link";
import Flash from "@/components/Flash.tsx";
import { registerAction } from "../actions.ts";

export default async function Register({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  return (
    <div className="narrow">
      <h1>Εγγραφή παίκτη</h1>
      <Flash sp={await searchParams} />
      <form action={registerAction} className="card">
        <label htmlFor="name">Ονοματεπώνυμο</label>
        <input id="name" name="name" autoComplete="name" required minLength={2} />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="phone">Κινητό (το βλέπει μόνο ο αντίπαλός σου, μετά την επιβεβαίωση)</label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" />
        <label htmlFor="password">Κωδικός (τουλάχιστον 8 χαρακτήρες)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <p><button>Δημιουργία λογαριασμού</button></p>
      </form>
      <p className="muted">Έχεις ήδη λογαριασμό; <Link href="/login">Σύνδεση</Link></p>
    </div>
  );
}
