import { PIXEL_COOLDOWN_MS } from "@42pixelwar/shared";

export class CooldownStore {
  private lastPixelByUser = new Map<string, number>();

  check(userId: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = Date.now();
    const lastPixelAt = this.lastPixelByUser.get(userId) ?? 0;
    const elapsed = now - lastPixelAt;

    if (elapsed < PIXEL_COOLDOWN_MS) {
      return { allowed: false, retryAfterMs: PIXEL_COOLDOWN_MS - elapsed };
    }

    this.lastPixelByUser.set(userId, now);
    return { allowed: true };
  }
}
