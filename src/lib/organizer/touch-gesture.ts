/** Gesture timing is independent of rendering so scrolling can cancel safely. */
export class TouchGesture {
  private down?: { key: string; x: number; y: number; time: number };
  private last?: { key: string; time: number };
  start(key: string, x: number, y: number, time: number): void { this.down = { key, x, y, time }; }
  move(x: number, y: number): boolean {
    if (!this.down) return false;
    if (Math.hypot(x - this.down.x, y - this.down.y) > 10) { this.cancel(); return false; }
    return true;
  }
  hold(): string | undefined { const key = this.down?.key; this.cancel(); return key; }
  end(time: number): 'tap' | 'double' | undefined {
    const down = this.down; this.down = undefined;
    if (!down) return;
    if (time - down.time >= 500) { this.last = undefined; return; }
    if (this.last?.key === down.key && time - this.last.time <= 300) { this.last = undefined; return 'double'; }
    this.last = { key: down.key, time }; return 'tap';
  }
  cancel(): void { this.down = undefined; this.last = undefined; }
}
