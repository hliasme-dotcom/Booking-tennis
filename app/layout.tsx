import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/auth.ts";
import { logoutAction } from "./actions.ts";

export const metadata: Metadata = {
  title: "Last-minute τένις",
  description: "Άδεια γήπεδα της τελευταίας στιγμής, με αντίπαλο του επιπέδου σου.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f5132" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  return (
    <html lang="el">
      <body>
        <header className="top">
          <Link href="/" className="brand">🎾 Last-minute τένις</Link>
          <nav>
            {u ? (
              <>
                <Link href="/">Αγώνες</Link>
                <Link href="/me">Ο λογαριασμός μου</Link>
                {u.role === "admin" && <Link href="/admin">Διαχείριση</Link>}
                <form action={logoutAction}><button className="link">Έξοδος</button></form>
              </>
            ) : (
              <>
                <Link href="/login">Σύνδεση</Link>
                <Link href="/register">Εγγραφή</Link>
              </>
            )}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
