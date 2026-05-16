import {
  ROUND_DURATION_MS,
  TARGETS,
  type RoundState,
  type TeamId,
  type TeamScore
} from "@42pixelwar/shared";

type FinishReason = "completed" | "expired";

export class RoundStore {
  private roundNumber = 1;
  private targetIndex = 0;
  private startedAt = Date.now();
  private wins: Record<TeamId, number> = { istanbul: 0, kocaeli: 0 };

  current(): RoundState {
    return {
      roundNumber: this.roundNumber,
      target: TARGETS[this.targetIndex],
      startedAt: new Date(this.startedAt).toISOString(),
      endsAt: new Date(this.startedAt + ROUND_DURATION_MS).toISOString(),
      wins: { ...this.wins }
    };
  }

  isExpired(now = Date.now()): boolean {
    return now >= this.startedAt + ROUND_DURATION_MS;
  }

  isCompleted(stats: Record<TeamId, TeamScore>): boolean {
    return stats.istanbul.targetPercent >= 100 || stats.kocaeli.targetPercent >= 100;
  }

  finish(stats: Record<TeamId, TeamScore>, _reason: FinishReason): RoundState {
    const winner = this.resolveWinner(stats);
    if (winner) {
      this.wins[winner] += 1;
    }

    this.roundNumber += 1;
    this.targetIndex = (this.targetIndex + 1) % TARGETS.length;
    this.startedAt = Date.now();

    return this.current();
  }

  private resolveWinner(stats: Record<TeamId, TeamScore>): TeamId | null {
    if (stats.istanbul.targetCorrect === stats.kocaeli.targetCorrect) {
      return null;
    }

    return stats.istanbul.targetCorrect > stats.kocaeli.targetCorrect ? "istanbul" : "kocaeli";
  }
}
