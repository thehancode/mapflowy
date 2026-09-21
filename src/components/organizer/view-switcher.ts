import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { translate, type OrganizerLanguage } from "../../lib/organizer";

export type OrganizerView = "voronoi" | "tree" | "file";

@customElement("view-switcher")
export class ViewSwitcher extends LitElement {
  @property({ reflect: true }) view: OrganizerView = "voronoi";
  @property({ reflect: true }) language: OrganizerLanguage = "en";

  static styles = css`
    :host { display: block; }
    div { display: flex; gap: .25rem; padding: .28rem; border: 1px solid var(--panel-border); border-radius: 999px; background: var(--panel); box-shadow: 0 12px 36px var(--shadow); backdrop-filter: blur(16px); }
    button { display: inline-flex; align-items: center; gap: .42rem; min-height: 2.35rem; padding: 0 .9rem; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font: 700 .76rem/1 system-ui, sans-serif; cursor: pointer; }
    button[aria-pressed="true"] { background: var(--ink); color: var(--background); }
    .view-key { padding: .15rem .38rem; border: 1px solid var(--panel-border); border-bottom-width: 2px; border-radius: 5px; background: var(--kbd); color: var(--ink); font: 700 .72rem system-ui; }
    button:focus-visible { outline: 2px solid #eb4d28; outline-offset: 2px; }
    @media (max-width: 600px) {
      div { gap: .08rem; padding: .18rem; }
      button { min-height: 2rem; padding: 0 .42rem; font-size: .65rem; }
      .view-key { display: none; }
    }
    @media (max-width: 380px) {
      button { padding: 0 .28rem; font-size: .61rem; }
    }
  `;

  private choose(view: OrganizerView): void {
    if (view === this.view) return;
    this.dispatchEvent(new CustomEvent<OrganizerView>("view-change", { detail: view, bubbles: true, composed: true }));
  }

  render() {
    return html`<div role="group" aria-label=${translate(this.language, "displayMode")}>
      <button aria-pressed=${this.view === "voronoi"} @click=${() => this.choose("voronoi")}><span class="view-key" aria-hidden="true">1</span>${translate(this.language, "voronoiView")}</button>
      <button aria-pressed=${this.view === "tree"} @click=${() => this.choose("tree")}><span class="view-key" aria-hidden="true">2</span>${translate(this.language, "graphView")}</button>
      <button aria-pressed=${this.view === "file"} @click=${() => this.choose("file")}><span class="view-key" aria-hidden="true">3</span>${translate(this.language, "treeView")}</button>
    </div>`;
  }
}

declare global { interface HTMLElementTagNameMap { "view-switcher": ViewSwitcher } }
