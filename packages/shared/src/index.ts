export const CANVAS_WIDTH = 500;
export const CANVAS_HEIGHT = 500;
export const PIXEL_COOLDOWN_MS = 1000;
export const TARGET_GRID_SIZE = 32;
export const TARGET_SOURCE_SIZE = 16;
export const TRANSPARENT_COLOR = "transparent";
export const ROUND_DURATION_MS = 60 * 60 * 1000;

export const TARGET_COLORS = {
  yellow: "#facc15",
  darkYellow: "#eab308",
  red: "#ef4444",
  black: "#000000"
} as const;

export const TARGET_COLOR_VALUES = Object.values(TARGET_COLORS);

export type TargetModel = readonly string[];

export type TargetDefinition = {
  id: string;
  name: string;
  model: TargetModel;
};

const PIKACHU_TARGET = [
  "................",
  "..DD........DD..",
  "..DD........DD..",
  "..DDYYYYYYYYDD..",
  "....YYYYYYYY....",
  "...YYYYYYYYYY...",
  "..YYYYYYYYYYYY..",
  "..YYBYYYYYYBYY..",
  ".YYYYYYYYYYYYYY.",
  ".RRYYYYYYYYYYRR.",
  ".YYYYYYYYYYYYYY.",
  "..YYYYYYYYYYYY..",
  "..YYYYYYYYYYYY..",
  "...YYYYYYYYYY...",
  "....YYYYYYYY....",
  "................"
] as const;

const FORTY_TWO_TARGET = [
  "................",
  "....YYY...YYY...",
  "...YYYY..YYYY...",
  "..YY.YY.YY.YY...",
  ".YY..YYYY..YY...",
  ".YY...YY...YY...",
  ".YYYYYYYYYYYY...",
  ".....YY....YY...",
  "....YY....YY....",
  "...YY....YY.....",
  "..YYYYYYYYYYYY..",
  "..YY....YY..YY..",
  ".YY....YY...YY..",
  ".YYYYYYYYYYYYY..",
  "................",
  "................"
] as const;

const SHIELD_TARGET = [
  "................",
  ".....YYYYYY.....",
  "...YYYYYYYYYY...",
  "..YYYYYYYYYYYY..",
  "..YYYBBBBYYYY...",
  "..YYYBYYBYYYY...",
  "..YYYBYYBYYYY...",
  "...YYBYYBYYY....",
  "...YYYYYYYYY....",
  "....YYYYYYY.....",
  ".....YYYYY......",
  "......YYY.......",
  ".......Y........",
  "................",
  "................",
  "................"
] as const;

export const TARGETS: readonly TargetDefinition[] = [
  { id: "pixel-chibi", name: "Pixel Chibi", model: PIKACHU_TARGET },
  { id: "forty-two", name: "42 Mark", model: FORTY_TWO_TARGET },
  { id: "shield", name: "Campus Shield", model: SHIELD_TARGET }
] as const;

export const TARGET_MODEL = TARGETS[0].model;

const TARGET_CHAR_TO_COLOR: Record<string, string | null> = {
  ".": null,
  Y: TARGET_COLORS.yellow,
  D: TARGET_COLORS.darkYellow,
  R: TARGET_COLORS.red,
  B: TARGET_COLORS.black
};

export const TEAMS = {
  istanbul: {
    id: "istanbul",
    name: "42 Istanbul",
    campusSlug: "istanbul",
    palette: [
      "#00d1ff",
      "#14f1ff",
      "#0077ff",
      "#7dd3fc",
      "#facc15",
      "#eab308",
      "#ef4444",
      "#000000",
      "#ffffff",
      "#111827",
      "#a855f7",
      "#10b981"
    ]
  },
  kocaeli: {
    id: "kocaeli",
    name: "42 Kocaeli",
    campusSlug: "kocaeli",
    palette: [
      "#ff005c",
      "#ff3b30",
      "#ff8a00",
      "#f97316",
      "#facc15",
      "#eab308",
      "#ef4444",
      "#000000",
      "#ffffff",
      "#111827",
      "#a855f7",
      "#10b981"
    ]
  }
} as const;

export type TeamId = keyof typeof TEAMS;

export type PlayerSession = {
  userId: string;
  login: string;
  displayName: string;
  teamId: TeamId;
  locationHost: string;
  verifiedAt: string;
};

export type Pixel = {
  x: number;
  y: number;
  color: string;
  teamId: TeamId;
  placedBy: string;
  placedAt: string;
};

export type TeamScore = {
  pixels: number;
  percent: number;
  targetCorrect: number;
  targetTotal: number;
  targetPercent: number;
};

export type RoundState = {
  roundNumber: number;
  target: TargetDefinition;
  startedAt: string;
  endsAt: string;
  wins: Record<TeamId, number>;
};

export type ClientMessage =
  | {
      type: "pixel:set";
      x: number;
      y: number;
      color: string;
    };

export type ServerMessage =
  | {
      type: "session";
      session: PlayerSession;
    }
  | {
      type: "snapshot";
      width: number;
      height: number;
      pixels: Pixel[];
      round: RoundState;
    }
  | {
      type: "pixel:set";
      pixel: Pixel;
    }
  | {
      type: "pixel:clear";
      x: number;
      y: number;
    }
  | {
      type: "error";
      code: string;
      message: string;
    }
  | {
      type: "stats";
      teams: Record<TeamId, TeamScore>;
      round: RoundState;
    }
  | {
      type: "round";
      round: RoundState;
    };

export function isTeamId(value: string): value is TeamId {
  return value === "istanbul" || value === "kocaeli";
}

export function isValidCanvasPoint(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < CANVAS_WIDTH && y < CANVAS_HEIGHT;
}

export function isColorAllowed(teamId: TeamId, color: string): boolean {
  const normalized = color.toLowerCase();
  return normalized === TRANSPARENT_COLOR || TEAMS[teamId].palette.includes(normalized as never);
}

export function targetColorAtGridCell(x: number, y: number, model: TargetModel = TARGET_MODEL): string | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= TARGET_GRID_SIZE || y >= TARGET_GRID_SIZE) {
    return null;
  }

  const sourceX = Math.floor((x / TARGET_GRID_SIZE) * TARGET_SOURCE_SIZE);
  const sourceY = Math.floor((y / TARGET_GRID_SIZE) * TARGET_SOURCE_SIZE);
  const row = model[sourceY];
  const char = row?.[sourceX] ?? ".";
  return TARGET_CHAR_TO_COLOR[char] ?? null;
}

export function canvasPointForGridCell(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(CANVAS_WIDTH - 1, Math.floor(((x + 0.5) / TARGET_GRID_SIZE) * CANVAS_WIDTH)),
    y: Math.min(CANVAS_HEIGHT - 1, Math.floor(((y + 0.5) / TARGET_GRID_SIZE) * CANVAS_HEIGHT))
  };
}

export function targetCells(model: TargetModel = TARGET_MODEL): Array<{ x: number; y: number; color: string }> {
  const cells: Array<{ x: number; y: number; color: string }> = [];

  for (let y = 0; y < TARGET_GRID_SIZE; y += 1) {
    for (let x = 0; x < TARGET_GRID_SIZE; x += 1) {
      const color = targetColorAtGridCell(x, y, model);
      if (color) {
        cells.push({ x, y, color });
      }
    }
  }

  return cells;
}
