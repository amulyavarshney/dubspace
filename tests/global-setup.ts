import { execSync } from "node:child_process";
import { config } from "dotenv";

export default function globalSetup() {
  config({ path: ".env.test", override: true });
  if (!process.env.DATABASE_URL?.includes("_test")) {
    throw new Error("Refusing to run tests: DATABASE_URL must point at a *_test database");
  }
  execSync("pnpm prisma migrate deploy", { stdio: "inherit", env: { ...process.env } });
}
