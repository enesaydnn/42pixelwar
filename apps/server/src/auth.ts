import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { TEAMS, type PlayerSession, type TeamId } from "@42pixelwar/shared";
import type { AppConfig } from "./config.js";

const SESSION_COOKIE = "pixelwar_session";

export async function registerAuthRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get("/auth/42", async (request, reply) => {
    if (!config.fortyTwo.clientId || !config.fortyTwo.clientSecret || !config.fortyTwo.redirectUri) {
      return reply.code(500).send({
        error: "42 OAuth is not configured",
        requiredEnv: ["FORTYTWO_CLIENT_ID", "FORTYTWO_CLIENT_SECRET", "FORTYTWO_REDIRECT_URI"]
      });
    }

    const forceLogin = (request.query as { force?: string }).force === "1";
    const params = createAuthorizeParams(
      {
        clientId: config.fortyTwo.clientId,
        redirectUri: config.fortyTwo.redirectUri
      },
      forceLogin
    );

    return reply.redirect(`https://api.intra.42.fr/oauth/authorize?${params.toString()}`);
  });

  app.get("/auth/42/switch", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.redirect("https://auth.42.fr/auth/realms/students-42/protocol/openid-connect/logout?client_id=intra");
  });

  app.get("/auth/42/callback", async (request, reply) => {
    const code = (request.query as { code?: string }).code;

    if (!code) {
      return reply.code(400).send({ error: "Missing OAuth code" });
    }

    if (!config.fortyTwo.clientId || !config.fortyTwo.clientSecret || !config.fortyTwo.redirectUri) {
      return reply.code(500).send({ error: "42 OAuth credentials are not configured" });
    }

    try {
      const token = await exchangeOAuthCode(code, config);
      const profile = await fetchIntraProfile(token.access_token);
      const activeLocation =
        (await fetchActiveLocation(token.access_token, profile.id).catch((error: unknown) => {
          request.log.warn({ error }, "42 active location endpoint failed; falling back to /v2/me.location");
          return null;
        })) ?? createLocationFromProfile(profile);
      const teamId = resolveTeam(profile, activeLocation);

      if (!teamId) {
        return reply.redirect(`${config.webOrigin}?auth_error=unsupported_campus`);
      }

      if (!activeLocation) {
        request.log.info({ login: profile.login }, "42 login rejected: unavailable");
        return reply.redirect(`${config.webOrigin}?auth_error=unavailable`);
      }

      const session: PlayerSession = {
        userId: String(profile.id),
        login: profile.login,
        displayName: profile.displayname ?? profile.usual_full_name ?? profile.login,
        teamId,
        locationHost: activeLocation.host,
        verifiedAt: new Date().toISOString()
      };

      setSessionCookie(reply, session);
      request.log.info({ login: profile.login, teamId, locationHost: activeLocation.host }, "42 login accepted");
      return reply.redirect(`${config.webOrigin}?arena=1`);
    } catch (error) {
      request.log.error({ error }, "42 OAuth callback failed");
      return reply.redirect(`${config.webOrigin}?auth_error=oauth_failed`);
    }
  });

  app.get("/auth/dev/:team", async (request, reply) => {
    if (!config.devAuthBypass) {
      return reply.code(404).send({ error: "Not found" });
    }

    const team = (request.params as { team: string }).team;
    if (team !== "istanbul" && team !== "kocaeli") {
      return reply.code(400).send({ error: "Team must be istanbul or kocaeli" });
    }

    const session = createDevSession(team);
    setSessionCookie(reply, session);
    return reply.redirect(`${config.webOrigin}?arena=1`);
  });

  app.get("/me", async (request, reply) => {
    const session = getSessionFromRequest(request, config);
    if (!session) {
      return reply.code(401).send({ error: "Not authenticated" });
    }

    return session;
  });

  app.post("/logout", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });
}

function createAuthorizeParams(
  config: {
    clientId: string;
    redirectUri: string;
  },
  forceLogin: boolean
): URLSearchParams {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "public"
  });

  if (forceLogin) {
    params.set("prompt", "login");
    params.set("state", `switch-${Date.now()}`);
  }

  return params;
}

export function getSessionFromRequest(request: FastifyRequest, config: AppConfig): PlayerSession | null {
  const encoded = request.cookies[SESSION_COOKIE];

  if (encoded) {
    try {
      return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PlayerSession;
    } catch {
      return null;
    }
  }

  if (!config.devAuthBypass) {
    return null;
  }

  return createDevSession("istanbul");
}

function createDevSession(teamId: TeamId): PlayerSession {
  return {
    userId: `dev-${teamId}`,
    login: `dev_${teamId}`,
    displayName: `${TEAMS[teamId].name} Operator`,
    teamId,
    locationHost: `${teamId}-lab-dev`,
    verifiedAt: new Date().toISOString()
  };
}

function setSessionCookie(reply: FastifyReply, session: PlayerSession): void {
  const value = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  reply.setCookie(SESSION_COOKIE, value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 60 * 60 * 6
  });
}

type FortyTwoToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type FortyTwoProfile = {
  id: number;
  login: string;
  displayname?: string;
  usual_full_name?: string;
  location?: string | null;
  campus?: Array<{ id: number; name: string }>;
  campus_users?: Array<{ campus_id: number; is_primary?: boolean; campus?: { id: number; name: string } }>;
};

type FortyTwoLocation = {
  id: number;
  host: string;
  campus_id?: number;
  end_at?: string | null;
};

async function exchangeOAuthCode(code: string, config: AppConfig): Promise<FortyTwoToken> {
  const response = await fetch("https://api.intra.42.fr/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: config.fortyTwo.clientId,
      client_secret: config.fortyTwo.clientSecret,
      code,
      redirect_uri: config.fortyTwo.redirectUri
    })
  });

  if (!response.ok) {
    throw new Error(`42 token exchange failed with ${response.status}`);
  }

  return (await response.json()) as FortyTwoToken;
}

function createLocationFromProfile(profile: FortyTwoProfile): FortyTwoLocation | null {
  if (!profile.location) {
    return null;
  }

  return {
    id: 0,
    host: profile.location,
    end_at: null
  };
}

async function fetchIntraProfile(accessToken: string): Promise<FortyTwoProfile> {
  const response = await fetch("https://api.intra.42.fr/v2/me", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`42 profile fetch failed with ${response.status}`);
  }

  return (await response.json()) as FortyTwoProfile;
}

async function fetchActiveLocation(accessToken: string, userId: number): Promise<FortyTwoLocation | null> {
  const url = new URL(`https://api.intra.42.fr/v2/users/${userId}/locations`);
  url.searchParams.set("filter[active]", "true");
  url.searchParams.set("page[size]", "1");

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`42 active location fetch failed with ${response.status}`);
  }

  const locations = (await response.json()) as FortyTwoLocation[];
  return locations.find((location) => !location.end_at) ?? locations[0] ?? null;
}

function resolveTeam(profile: FortyTwoProfile, activeLocation: FortyTwoLocation | null): TeamId | null {
  const campuses = [
    ...(profile.campus ?? []),
    ...(profile.campus_users ?? []).map((campusUser) => campusUser.campus).filter(Boolean)
  ] as Array<{ id: number; name: string }>;

  const locationCampus = activeLocation?.campus_id
    ? campuses.find((campus) => campus.id === activeLocation.campus_id)
    : null;
  const primaryCampus =
    locationCampus ??
    campuses.find((campus) => campus.name.toLowerCase().includes("istanbul")) ??
    campuses.find((campus) => campus.name.toLowerCase().includes("kocaeli"));

  if (!primaryCampus) {
    return null;
  }

  const name = primaryCampus.name.toLowerCase();
  if (name.includes("istanbul")) {
    return "istanbul";
  }
  if (name.includes("kocaeli")) {
    return "kocaeli";
  }

  return null;
}
