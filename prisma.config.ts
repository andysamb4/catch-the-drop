import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// The CLI (migrate/generate/studio) needs a direct connection — Neon's pooled
// PgBouncer connection doesn't support the session locks Prisma Migrate uses.
// The running app uses the pooled DATABASE_URL instead, see src/lib/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL_UNPOOLED"),
  },
});
