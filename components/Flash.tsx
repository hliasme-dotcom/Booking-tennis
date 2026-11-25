export default function Flash({ sp }: { sp: { ok?: string; err?: string } }) {
  if (sp.err) return <p className="flash err" role="alert">{sp.err}</p>;
  if (sp.ok) return <p className="flash ok" role="status">{sp.ok}</p>;
  return null;
}
