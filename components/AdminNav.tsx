import Link from "next/link";

export default function AdminNav() {
  return (
    <div className="tabs">
      <Link href="/admin">Slots &amp; αγώνες</Link>
      <Link href="/admin/players">Παίκτες &amp; πορτοφόλια</Link>
      <Link href="/admin/clubs">Κλαμπ &amp; γήπεδα</Link>
      <Link href="/admin/report">Αναφορά</Link>
    </div>
  );
}
