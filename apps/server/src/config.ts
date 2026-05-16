import { existsSync } from "node:fs";

for (const envPath of ["../../.env", ".env"]) {
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

export type AppConfig = {
  port: number;
  webOrigin: string;
  devAuthBypass: boolean;
  databaseUrl?: string;
  redisUrl?: string;
  fortyTwo: {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
  };
};

export function readConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 8787),
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    devAuthBypass: process.env.DEV_AUTH_BYPASS !== "false",
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    fortyTwo: {
      clientId: process.env.FORTYTWO_CLIENT_ID,
      clientSecret: process.env.FORTYTWO_CLIENT_SECRET,
      redirectUri: process.env.FORTYTWO_REDIRECT_URI
    }
  };
}
