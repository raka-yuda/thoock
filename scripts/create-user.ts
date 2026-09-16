import "dotenv/config";
import { hash } from "bcryptjs";
import { getDb } from "../src/db";
import { users } from "../src/db/schema";

async function main() {
  const email = process.env.INITIAL_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_USER_PASSWORD;
  if (!email)
    throw new Error(
      "Set INITIAL_USER_EMAIL in .env before running npm run user:create.",
    );
  if (!password || password.length < 12)
    throw new Error(
      "Set INITIAL_USER_PASSWORD in .env to at least 12 characters, then rerun npm run user:create.",
    );
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Set DATABASE_URL in .env before running npm run user:create.",
    );
  const passwordHash = await hash(password, 12);
  await getDb()
    .insert(users)
    .values({ email, passwordHash })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash, updatedAt: new Date() },
    });
  console.info(
    `Owner account ready for ${email}. Remove INITIAL_USER_PASSWORD from the environment now.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "User creation failed.",
    );
    process.exit(1);
  });
