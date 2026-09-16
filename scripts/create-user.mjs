import { hash } from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const email = process.env.INITIAL_USER_EMAIL?.trim().toLowerCase();
const password = process.env.INITIAL_USER_PASSWORD;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!email) throw new Error("INITIAL_USER_EMAIL is required.");
if (!password || password.length < 12) throw new Error("INITIAL_USER_PASSWORD must contain at least 12 characters.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const passwordHash = await hash(password, 12);
  await pool.query(
    `insert into users (id, email, password_hash, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, now(), now())
     on conflict (email) do update set password_hash = excluded.password_hash, updated_at = now()`,
    [email, passwordHash],
  );
  console.info(`Owner account ready for ${email}. Remove INITIAL_USER_PASSWORD from the environment now.`);
} finally {
  await pool.end();
}
