/** Two separate Space presses on the same node and view, within half a second. */
export class MarkShortcut {
  private pending?: { node: object; view: string; time: number };

  reset(): void { this.pending = undefined; }

  press(node: object, view: string, time: number, repeat = false): boolean {
    if (repeat) return false;
    const previous = this.pending;
    if (previous?.node === node && previous.view === view && time - previous.time <= 500 && time >= previous.time) {
      this.reset();
      return true;
    }
    this.pending = { node, view, time };
    return false;
  }
}
