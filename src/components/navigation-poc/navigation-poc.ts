import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { keyed } from "lit/directives/keyed.js";
import "../organizer/organizer-app";
import { LayoutController } from "./layout-controller";
import { demoSession } from "./demo";

@customElement("navigation-poc")
export class NavigationPoc extends LitElement {
  private session = demoSession();
  private controller?: LayoutController;
  private generation = 0;
  static styles = css`
    :host { display:flex; flex-direction:column; height:100dvh; overflow:hidden; font:13px system-ui,sans-serif; background:#e8e7de; color:#171a17; }
    nav { padding:6px 8px; border-bottom:1px solid #bdbeb5; }
    .row { display:flex; align-items:center; gap:6px; }
    strong { flex:1; font-size:13px; }
    button,a { display:inline-flex; justify-content:center; align-items:center; min-width:44px; min-height:44px; box-sizing:border-box; padding:6px; border:1px solid #bdbeb5; border-radius:6px; color:inherit; background:#faf9f4; text-decoration:none; font:inherit; cursor:pointer; }
    button:disabled { opacity:.35; cursor:default; }
    p { margin:3px 0; font-size:12px; }
    .instructions { display:flex; align-items:center; gap:8px; height:52px; }
    .instructions p { flex:1; }
    .notice { min-height:16px; margin:0; font-size:11px; }
    organizer-app { flex:1; height:0; min-height:0; }
  `;
  private reset = () => {
    this.controller?.disconnect(); this.controller = undefined;
    this.session = demoSession(); this.generation++; this.requestUpdate();
  };
  render() {
    this.controller ??= new LayoutController("balloon", () => this.requestUpdate());
    return html`<nav aria-label="Navigation experiments"><div class="row">
      <strong>Balloon tree</strong>
      <button @click=${this.reset}>Reset</button>
    </div><div class="instructions"><p>Children orbit their parents. Drag empty space; use Back above +.</p>
    </div><p class="notice" role="status">${this.controller.layouts.notice}</p></nav>${keyed(this.generation, html`<organizer-app .session=${this.session} .graphNavigation=${this.controller}></organizer-app>`)}`;
  }
}
