import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  canvasPointForGridCell,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  TEAMS,
  TARGET_GRID_SIZE,
  TRANSPARENT_COLOR,
  targetColorAtGridCell,
  type Pixel,
  type PlayerSession,
  type RoundState,
  type ServerMessage,
  type TeamScore,
  type TargetModel,
  type TeamId
} from "@42pixelwar/shared";
import "./styles.css";

const apiUrl = import.meta.env.VITE_GAME_API_URL ?? "http://localhost:8787";
const wsUrl = import.meta.env.VITE_GAME_WS_URL ?? "ws://localhost:8787/ws";
const gameGridLength = TARGET_GRID_SIZE;
const emptyPixel = TRANSPARENT_COLOR;

function App() {
  const params = new URLSearchParams(window.location.search);
  const isArena = params.get("arena") === "1";
  return isArena ? <GameScreen /> : <LoginScreen />;
}

function LoginScreen() {
  const authError = new URLSearchParams(window.location.search).get("auth_error");
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const [entryShare, setEntryShare] = useState({ istanbul: 50, kocaeli: 50 });

  useEffect(() => {
    let cancelled = false;

    async function loadEntryStats() {
      try {
        const response = await fetch(`${apiUrl}/canvas/snapshot`);
        if (!response.ok) {
          return;
        }

        const snapshot = (await response.json()) as { stats: Record<TeamId, TeamScore> };
        const nextShare = calculateEntryShare(snapshot.stats);
        if (!cancelled) {
          setEntryShare(nextShare);
        }
      } catch {
        // Keep the neutral 50/50 split when the API is not available.
      }
    }

    loadEntryStats();
    const interval = window.setInterval(loadEntryStats, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const canvas = previewRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) {
      return;
    }

    const context = ctx;
    const width = 900;
    const height = 900;
    const cell = 5;
    const center = { x: width * 0.5, y: height * 0.5 };
    const fronts = Array.from({ length: 2600 }, (_, index) => {
      const side = index % 9 < 5 ? -1 : 1;
      const radius = 120 + Math.random() * 360;
      const angle = Math.random() * Math.PI * 2;

      return {
        x: Math.floor((center.x + Math.cos(angle) * radius + side * (70 + Math.random() * 160)) / cell) * cell,
        y: Math.floor((center.y + Math.sin(angle) * radius + Math.sin(angle * 3) * 44) / cell) * cell,
        color: side < 0 ? "#14d1ff" : "#f00056",
        drift: Math.random() * Math.PI * 2,
        size: Math.random() > 0.9 ? cell * 2 : cell
      };
    });
    const sparks = Array.from({ length: 90 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      delay: Math.random() * 160
    }));

    let frame = 0;
    let animation = 0;

    function draw() {
      frame += 1;
      context.fillStyle = "#07080d";
      context.fillRect(0, 0, width, height);

      context.strokeStyle = "rgba(166, 230, 255, 0.06)";
      context.lineWidth = 1;
      for (let i = 0; i <= width; i += 30) {
        context.beginPath();
        context.moveTo(i, 0);
        context.lineTo(i, height);
        context.stroke();
        context.beginPath();
        context.moveTo(0, i);
        context.lineTo(width, i);
        context.stroke();
      }

      context.globalAlpha = 0.1;
      context.fillStyle = "#14d1ff";
      context.fillRect(172, 154, 26, 592);
      context.fillRect(130, 492, 238, 30);
      context.fillRect(340, 154, 28, 592);
      context.fillStyle = "#f00056";
      context.fillRect(526, 160, 250, 28);
      context.fillRect(750, 160, 28, 250);
      context.fillRect(526, 408, 252, 28);
      context.fillRect(526, 408, 28, 328);
      context.fillRect(526, 708, 252, 28);

      for (const pixel of fronts) {
        const wave = Math.sin(frame * 0.018 + pixel.drift);
        const centerPull = pixel.color === "#14d1ff" ? 1 : -1;
        const x = pixel.x + wave * 6 + centerPull * Math.sin(frame * 0.011) * 24;
        const y = pixel.y + Math.cos(frame * 0.014 + pixel.drift) * 5;
        context.globalAlpha = 0.2 + Math.abs(wave) * 0.62;
        context.fillStyle = pixel.color;
        context.fillRect(x, y, pixel.size, pixel.size);
      }

      context.globalAlpha = 0.34;
      context.fillStyle = "#14d1ff";
      context.fillRect(250 + Math.sin(frame * 0.012) * 26, 318, 270, 230);
      context.fillStyle = "#f00056";
      context.fillRect(462 + Math.cos(frame * 0.01) * 22, 378, 260, 206);
      context.globalAlpha = 1;

      for (const spark of sparks) {
        const pulse = (frame + spark.delay) % 160;
        if (pulse < 36) {
          context.globalAlpha = 1 - pulse / 36;
          context.strokeStyle = pulse % 2 > 1 ? "#14d1ff" : "#f00056";
          context.strokeRect(spark.x - pulse, spark.y - pulse, pulse * 2, pulse * 2);
        }
      }
      context.globalAlpha = 1;

      animation = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animation);
  }, []);

  return (
    <main className="entryMap">
      <canvas ref={previewRef} width={900} height={900} className="entryMapCanvas" />
      <div className="entryMapGrid" />
      <div className="entryMapShade" />
      <div className="entryScanline" />

      <header className="mapHeader">
        <a className="mapBrand" href="/">
          <span className="entryIcon entryIconShield" aria-hidden="true" />
          <strong>42 PIXEL WAR</strong>
        </a>
        <div className="mapHeaderMeta">
          <span>ISTANBUL</span>
          <strong>VS</strong>
          <span>KOCAELI</span>
        </div>
        <span className="mapStatus"><i /> LIVE</span>
      </header>

      <section className="entryStage" aria-label="42 Pixel War giriş">
        <div className="battleHud">
          <div className="sectorTag">SEKTOR 42-B</div>
          <div className="battleTitle">
            <span>500 x 500</span>
            <h1>PIXEL WAR</h1>
          </div>

          <div className="territoryBar" aria-label="Takım kontrol oranı">
            <div className="territoryIstanbul" style={{ width: `${entryShare.istanbul}%` }} />
            <div className="territoryKocaeli" style={{ width: `${entryShare.kocaeli}%` }} />
          </div>

          <div className="teamClash">
            <div className="teamBlock istanbul">
              <small>ISTANBUL</small>
              <strong>{entryShare.istanbul}%</strong>
            </div>
            <div className="teamBlock kocaeli">
              <small>KOCAELI</small>
              <strong>{entryShare.kocaeli}%</strong>
            </div>
          </div>
        </div>

        <aside className="mapAccess">
          <div className="accessTop">
            <span className="entryIcon entryIconGrid" aria-hidden="true" />
            <strong>SAVAŞ ALANI</strong>
          </div>
          {authError ? (
            <div className="mapError" role="alert">
              {authError === "unavailable" ? "UNAVAILABLE" : "AUTH ERROR"}
            </div>
          ) : null}
          <a className="mapLogin" href={`${apiUrl}/auth/42`}>
            <span className="entryIcon entryIconLogin" aria-hidden="true" />
            42 Intra ile Giriş Yap
          </a>
          <a className="switchAccount" href={`${apiUrl}/auth/42/switch`}>
            42 hesabından çık ve değiştir
          </a>
          <div className="devAccess">
            <a href={`${apiUrl}/auth/dev/istanbul`}>Test İstanbul</a>
            <a href={`${apiUrl}/auth/dev/kocaeli`}>Test Kocaeli</a>
          </div>
          <div className="mapRules">
            <span>ONLINE ONLY</span>
            <span>1 PX / SN</span>
            <span>TEAM PALETTE</span>
          </div>
        </aside>

        <div className="mapCoordinates" aria-hidden="true">
          <span>X 284</span>
          <span>Y 119</span>
          <span>PALETTE LOCKED</span>
        </div>
      </section>
    </main>
  );
}

function calculateEntryShare(stats: Record<TeamId, TeamScore>): { istanbul: number; kocaeli: number } {
  const istanbul = stats.istanbul.targetCorrect;
  const kocaeli = stats.kocaeli.targetCorrect;
  const total = istanbul + kocaeli;

  if (total <= 0) {
    return { istanbul: 50, kocaeli: 50 };
  }

  const istanbulShare = Math.round((istanbul / total) * 100);
  return {
    istanbul: istanbulShare,
    kocaeli: 100 - istanbulShare
  };
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function GameScreen() {
  const socketRef = useRef<WebSocket | null>(null);
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [status, setStatus] = useState("Sistem Hazır");
  const [selectedColor, setSelectedColor] = useState<string>(TEAMS.istanbul.palette[0]);
  const [grid, setGrid] = useState<string[]>(() => createSeedGrid());
  const [round, setRound] = useState<RoundState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [cooldown, setCooldown] = useState(0);
  const [logs, setLogs] = useState<string[]>([
    "[08:16:21] IST_CAMPUS: Piksel silindi",
    "[08:16:19] KOC_CAMPUS: Alan genişletti",
    "[08:16:15] IST_CAMPUS: Savunma hattı kurdu"
  ]);
  const [stats, setStats] = useState<Record<TeamId, TeamScore>>({
    istanbul: { pixels: 0, percent: 0, targetCorrect: 0, targetTotal: 0, targetPercent: 0 },
    kocaeli: { pixels: 0, percent: 0, targetCorrect: 0, targetTotal: 0, targetPercent: 0 }
  });

  const activeTeam = session?.teamId ?? "istanbul";
  const palette = TEAMS[activeTeam].palette;
  const activeTarget = round?.target.model;
  const activeTargetName = round?.target.name ?? "Pixel Target";
  const roundWins = round?.wins ?? { istanbul: 0, kocaeli: 0 };
  const remainingMs = Math.max(0, (round ? new Date(round.endsAt).getTime() : now) - now);
  const countdown = formatCountdown(remainingMs);

  useEffect(() => {
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setStatus("Canlı Bağlantı");
      pushLog("SYS", "WebSocket bağlantısı açıldı");
    });
    socket.addEventListener("close", () => setStatus("Bağlantı Kapandı"));
    socket.addEventListener("error", () => setStatus("Bağlantı Hatası"));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as ServerMessage;

      if (message.type === "session") {
        setSession(message.session);
        setSelectedColor(TEAMS[message.session.teamId].palette[0]);
      }

      if (message.type === "snapshot") {
        setRound(message.round);
        setGrid(snapshotToGrid(message.pixels));
      }

      if (message.type === "pixel:set") {
        setGrid((current) => setGridPixel(current, message.pixel));
        pushLog(message.pixel.teamId === "istanbul" ? "IST_CAMPUS" : "KOC_CAMPUS", "Piksel boyandı");
      }

      if (message.type === "pixel:clear") {
        setGrid((current) => clearGridPixel(current, message.x, message.y));
        pushLog("SYS", "Piksel temizlendi");
      }

      if (message.type === "stats") {
        setRound(message.round);
        setStats(message.teams);
      }

      if (message.type === "round") {
        setRound(message.round);
        setGrid(createSeedGrid());
        setStatus(`Yeni hedef: ${message.round.target.name}`);
      }

      if (message.type === "error") {
        setStatus(message.message);
      }
    });

    return () => socket.close();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function pushLog(campus: string, action: string) {
    const time = new Date().toLocaleTimeString("tr-TR", { hour12: false });
    setLogs((current) => [`[${time}] ${campus}: ${action}`, ...current].slice(0, 30));
  }

  function placePixel(index: number) {
    const socket = socketRef.current;

    if (cooldown > 0) {
      return;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatus("Sunucu bağlantısı hazır değil");
      return;
    }

    const cellX = index % gameGridLength;
    const cellY = Math.floor(index / gameGridLength);
    const { x, y } = canvasPointForGridCell(cellX, cellY);
    const targetColor = targetColorAtGridCell(cellX, cellY, activeTarget);

    socket.send(JSON.stringify({ type: "pixel:set", x, y, color: selectedColor }));
    if (selectedColor === TRANSPARENT_COLOR) {
      setStatus("Piksel temizlendi");
    } else if (targetColor) {
      setStatus(selectedColor.toLowerCase() === targetColor ? "Tam isabet" : "Hedef rengi bozuldu");
    } else {
      setStatus("Hedef dışı alan");
    }
    setCooldown(1);
  }

  return (
    <main className="gameShell">
      <header className="gameHeader">
        <div className="gameBrand">
          <strong>42 PIXEL WAR</strong>
          <span>PIXEL ART EDITION</span>
        </div>
        <div className="gameMode">
          ROUND {round?.roundNumber ?? 1} / {activeTargetName}
        </div>
        <div className="roundTimer">
          <span>KALAN SÜRE</span>
          <strong>{countdown}</strong>
        </div>
      </header>

      <section className="gameScoreboard">
        <div>
          <span>SEC_01 // İSTANBUL</span>
          <strong>{stats.istanbul.targetPercent}%</strong>
          <small>
            {stats.istanbul.targetCorrect}/{stats.istanbul.targetTotal || 0} doğru hedef
          </small>
        </div>
        <div className="targetBadge">HEDEF İSABETİ</div>
        <div>
          <span>SEC_02 // KOCAELİ</span>
          <strong>{stats.kocaeli.targetPercent}%</strong>
          <small>
            {stats.kocaeli.targetCorrect}/{stats.kocaeli.targetTotal || 0} doğru hedef
          </small>
        </div>
        <div className="gameControlBar">
          <span style={{ width: `${stats.istanbul.targetPercent}%` }} />
          <i style={{ width: `${stats.kocaeli.targetPercent}%` }} />
        </div>
      </section>

      <section className="gameBoardLayout">
        <aside className="telemetryPanel">
          <span className="gamePanelTitle">// AKTİF TELEMETRİ</span>
          <div className="gameLogs">
            {logs.map((log, index) => (
              <div key={`${log}-${index}`}>{log}</div>
            ))}
          </div>
        </aside>

        <section className="pixelBoardStage">
          <div className="pixelBoardFrame">
            <div className="targetGuide" aria-hidden="true">
              <TargetModel model={activeTarget} />
            </div>
            <div className="pixelBoard" style={{ gridTemplateColumns: `repeat(${gameGridLength}, 1fr)` }}>
              {grid.map((color, index) => (
                <PixelCell key={index} color={color} index={index} targetModel={activeTarget} onPlace={placePixel} />
              ))}
            </div>
          </div>
          <div className="guideControl">KILAVUZ YOĞUNLUĞU: AKTİF</div>
        </section>

        <aside className="targetPanel">
          <div className="targetCard">
            <span className="gamePanelTitle">// HEDEF MODEL</span>
            <div className="targetPreview">
              <TargetModel model={activeTarget} />
              <em>{activeTargetName}</em>
            </div>
          </div>

          <div className="targetCard">
            <span className="gamePanelTitle">// ROUND GALİBİYETLERİ</span>
            <div className="miniScore">
              <span>42 Istanbul</span>
              <strong>{roundWins.istanbul}</strong>
            </div>
            <div className="miniScore">
              <span>42 Kocaeli</span>
              <strong>{roundWins.kocaeli}</strong>
            </div>
          </div>

          <div className="targetCard">
            <span className="gamePanelTitle">// OPERATOR</span>
            <strong>{session?.displayName ?? "42 Operator"}</strong>
            <p>{session ? `${session.login} / ${session.locationHost}` : "42 active location bekleniyor"}</p>
          </div>
        </aside>
      </section>

      <footer className="gameFooter">
        <div className={cooldown > 0 ? "cooldownBox danger" : "cooldownBox"}>
          <span />
          <div>
            <small>{cooldown > 0 ? "BAN KORUMASI" : status}</small>
            <strong>{cooldown > 0 ? `${cooldown}s` : "READY"}</strong>
          </div>
        </div>

        <div className="gamePalette">
          <button
            className={selectedColor === TRANSPARENT_COLOR ? "gameSwatch transparentSwatch active" : "gameSwatch transparentSwatch"}
            onClick={() => setSelectedColor(TRANSPARENT_COLOR)}
            title="Transparent / Sil"
          />
          {palette.map((color) => (
            <button
              key={color}
              className={`${color === "#000000" ? "gameSwatch blackSwatch" : "gameSwatch"}${selectedColor === color ? " active" : ""}`}
              style={{ backgroundColor: color }}
              onClick={() => setSelectedColor(color)}
              title={color}
            />
          ))}
        </div>

        <div className="playerTeam">Takım: {TEAMS[activeTeam].name}</div>
      </footer>
    </main>
  );
}

function createSeedGrid(): string[] {
  return Array(gameGridLength * gameGridLength).fill(emptyPixel);
}

function snapshotToGrid(pixels: Pixel[]): string[] {
  return pixels.reduce((current, pixel) => setGridPixel(current, pixel), Array(gameGridLength * gameGridLength).fill(emptyPixel));
}

function setGridPixel(current: string[], pixel: Pixel): string[] {
  const next = [...current];
  const x = Math.min(gameGridLength - 1, Math.floor((pixel.x / CANVAS_WIDTH) * gameGridLength));
  const y = Math.min(gameGridLength - 1, Math.floor((pixel.y / CANVAS_HEIGHT) * gameGridLength));
  next[y * gameGridLength + x] = pixel.color;
  return next;
}

function clearGridPixel(current: string[], canvasX: number, canvasY: number): string[] {
  const next = [...current];
  const x = Math.min(gameGridLength - 1, Math.floor((canvasX / CANVAS_WIDTH) * gameGridLength));
  const y = Math.min(gameGridLength - 1, Math.floor((canvasY / CANVAS_HEIGHT) * gameGridLength));
  next[y * gameGridLength + x] = emptyPixel;
  return next;
}

function PixelCell({
  color,
  index,
  targetModel,
  onPlace
}: {
  color: string;
  index: number;
  targetModel?: TargetModel;
  onPlace: (index: number) => void;
}) {
  const cellX = index % gameGridLength;
  const cellY = Math.floor(index / gameGridLength);
  const targetColor = targetColorAtGridCell(cellX, cellY, targetModel);
  const style = {
    backgroundColor: color === emptyPixel ? undefined : color,
    "--target-color": targetColor ?? "transparent"
  } as CSSProperties;

  return (
    <button
      className={targetColor ? "pixelCell targetPixel" : "pixelCell"}
      style={style}
      onClick={() => onPlace(index)}
      aria-label={`${index}. piksel`}
    />
  );
}

function TargetModel({ model }: { model?: TargetModel }) {
  const cells = [];

  for (let y = 0; y < gameGridLength; y += 1) {
    for (let x = 0; x < gameGridLength; x += 1) {
      const color = targetColorAtGridCell(x, y, model);
      if (color) {
        cells.push(<rect key={`${x}:${y}`} x={x} y={y} width="1" height="1" fill={color} />);
      }
    }
  }

  return (
    <svg viewBox={`0 0 ${gameGridLength} ${gameGridLength}`} shapeRendering="crispEdges" aria-hidden="true">
      {cells}
    </svg>
  );
}

declare global {
  interface Window {
    __pixelWarRoot?: Root;
  }
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container is missing.");
}

window.__pixelWarRoot ??= createRoot(container);
window.__pixelWarRoot.render(<App />);
