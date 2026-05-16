import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  canvasPointForGridCell,
  targetCells,
  type Pixel,
  type TeamScore,
  type TeamId,
  type TargetDefinition
} from "@42pixelwar/shared";

type TeamStats = Record<TeamId, TeamScore>;

export class CanvasStore {
  private pixels = new Map<string, Pixel>();

  snapshot(): Pixel[] {
    return [...this.pixels.values()];
  }

  setPixel(pixel: Pixel): Pixel {
    this.pixels.set(`${pixel.x}:${pixel.y}`, pixel);
    return pixel;
  }

  clearPixel(x: number, y: number): void {
    this.pixels.delete(`${x}:${y}`);
  }

  clear(): void {
    this.pixels.clear();
  }

  stats(target: TargetDefinition): TeamStats {
    const counts: Record<TeamId, number> = { istanbul: 0, kocaeli: 0 };
    const targetCounts: Record<TeamId, number> = { istanbul: 0, kocaeli: 0 };
    const modelCells = targetCells(target.model);

    for (const pixel of this.pixels.values()) {
      counts[pixel.teamId] += 1;
    }

    for (const cell of modelCells) {
      const point = canvasPointForGridCell(cell.x, cell.y);
      const pixel = this.pixels.get(`${point.x}:${point.y}`);

      if (pixel?.color.toLowerCase() === cell.color) {
        targetCounts[pixel.teamId] += 1;
      }
    }

    const total = CANVAS_WIDTH * CANVAS_HEIGHT;
    const targetTotal = modelCells.length;

    return {
      istanbul: {
        pixels: counts.istanbul,
        percent: Number(((counts.istanbul / total) * 100).toFixed(2)),
        targetCorrect: targetCounts.istanbul,
        targetTotal,
        targetPercent: Number(((targetCounts.istanbul / targetTotal) * 100).toFixed(2))
      },
      kocaeli: {
        pixels: counts.kocaeli,
        percent: Number(((counts.kocaeli / total) * 100).toFixed(2)),
        targetCorrect: targetCounts.kocaeli,
        targetTotal,
        targetPercent: Number(((targetCounts.kocaeli / targetTotal) * 100).toFixed(2))
      }
    };
  }
}
