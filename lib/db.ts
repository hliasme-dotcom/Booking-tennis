import pg from "pg";

// numeric -> number (ATRP), bigint sums -> number
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

const g = globalThis as unknown as { __pool?: pg.Pool };

export function pool(): pg.Pool {
  if (!g.__pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.__pool = new pg.Pool({ connectionString: url, max: 10 });
  }
  return g.__pool;
}

export type Q = pg.PoolClient | pg.Pool;

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
