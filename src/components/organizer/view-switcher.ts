import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

export type OrganizerView = "voronoi" | "tree" | "file";

@customElement("view-switcher")
export class ViewSwitcher extends LitElement {
  @property({ reflect: true }) view: OrganizerView = "voronoi";

  static styles = css`
    :host { display: block; }
    div { display: flex; gap: .25rem; padding: .28rem; border: 1px solid var(--panel-border); border-radius: 999px; background: var(--panel); box-shadow: 0 12px 36px var(--shadow); backdrop-filter: blur(16px); }
    button { min-height: 2.35rem; padding: 0 .9rem; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font: 700 .76rem/1 system-ui, sans-serif; cursor: pointer; }
    button[aria-pressed="true"] { background: var(--ink); color: var(--background); }
    button:focus-visible { outline: 2px solid #eb4d28; outline-offset: 2px; }
    @media (max-width: 520px) { button { padding: 0 .66rem; font-size: .7rem; } }
  `;

  private choose(view: OrganizerView): void {
    if (view === this.view) return;
    this.dispatchEvent(new CustomEvent<OrganizerView>("view-change", { detail: view, bubbles: true, composed: true }));
  }

  render() {
    return html`<div role="group" aria-label="Display mode">
      <button aria-pressed=${this.view === "voronoi"} @click=${() => this.choose("voronoi")}>Voronoi</button>
      <button aria-pressed=${this.view === "tree"} @click=${() => this.choose("tree")}>Tree graph</button>
      <button aria-pressed=${this.view === "file"} @click=${() => this.choose("file")}>File tree</button>
    </div>`;
  }
}

declare global { interface HTMLElementTagNameMap { "view-switcher": ViewSwitcher } }
