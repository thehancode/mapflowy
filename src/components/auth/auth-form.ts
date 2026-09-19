import { LitElement, css, html, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { validateConsumerEmail } from "../../lib/auth/email";

export type AuthMode = "login" | "signup" | "forgot";

export type AuthEmailSubmitDetail =
  | { email: string; mode: "login" | "signup"; password: string }
  | { email: string; mode: "forgot" };

export type AuthEmailSubmitEvent = CustomEvent<AuthEmailSubmitDetail>;

declare global {
  interface HTMLElementTagNameMap {
    "auth-form": AuthForm;
  }

  interface HTMLElementEventMap {
    "auth-email-submit": AuthEmailSubmitEvent;
  }
}

/**
 * An intentionally backend-agnostic authentication shell.
 *
 * `auth-email-submit` is the only email action this component emits. A host
 * application owns the listener and decides how (or whether) to call its API.
 */
@customElement("auth-form")
export class AuthForm extends LitElement {
  @property({ reflect: true }) mode: AuthMode = "login";

  /** API origin used to build the Google sign-in start URL. */
  @property({ attribute: "public-api-base-url" }) publicApiBaseUrl = "";

  /** Alias useful when configuring the element from TypeScript. */
  @property({ attribute: "api-base-url" }) apiBaseUrl = "";

  @state() private email = "";
  @state() private confirmation = "";
  @state() private emailError = "";
  @state() private confirmationError = "";
  @state() private password = "";
  @state() private passwordError = "";

  static styles = css`
    :host {
      display: block;
      color: #171a17;
      font: 1rem/1.45 system-ui, sans-serif;
    }

    form { display: grid; gap: 1rem; }
    label { display: grid; gap: .35rem; font-weight: 650; }
    input {
      box-sizing: border-box;
      width: 100%;
      min-height: 2.7rem;
      padding: .55rem .7rem;
      border: 1px solid #b8b6ab;
      border-radius: .45rem;
      background: #fff;
      color: inherit;
      font: inherit;
    }
    input[aria-invalid="true"] { border-color: #b42318; }
    button, a {
      display: inline-flex;
      min-height: 2.7rem;
      box-sizing: border-box;
      align-items: center;
      justify-content: center;
      border-radius: .45rem;
      font: inherit;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }
    button[type="submit"] { border: 0; background: #171a17; color: #fff; }
    button[type="submit"]:disabled { cursor: not-allowed; opacity: .55; }
    .google { border: 1px solid #b8b6ab; background: #fff; color: inherit; }
    .google[aria-disabled="true"] { cursor: not-allowed; opacity: .6; }
    .divider { margin: 0; color: #686a63; font-size: .85rem; text-align: center; }
    .hint, .error { margin: 0; font-size: .85rem; }
    .hint { color: #686a63; }
    .error { color: #b42318; }
    :focus-visible { outline: 2px solid #eb4d28; outline-offset: 2px; }
  `;

  get effectiveApiBaseUrl(): string {
    return (this.publicApiBaseUrl || this.apiBaseUrl).trim().replace(/\/$/, "");
  }

  get googleStartUrl(): string {
    return this.effectiveApiBaseUrl ? `${this.effectiveApiBaseUrl}/auth/google/start` : "";
  }

  private get isSignup(): boolean {
    return this.mode === "signup";
  }

  private modeTitle(): string {
    if (this.mode === "signup") return "Create your account";
    if (this.mode === "forgot") return "Reset your access";
    return "Welcome back";
  }

  private validateEmail(value: string): string {
    return validateConsumerEmail(value);
  }

  private onEmailInput(event: Event): void {
    this.email = (event.target as HTMLInputElement).value;
    if (this.emailError) this.emailError = this.validateEmail(this.email);
  }

  private onConfirmationInput(event: Event): void {
    this.confirmation = (event.target as HTMLInputElement).value;
    if (this.confirmationError) this.confirmationError = this.password === this.confirmation ? "" : "Passwords must match.";
  }

  private onPasswordInput(event: Event): void {
    this.password = (event.target as HTMLInputElement).value;
    if (this.passwordError) this.passwordError = this.validatePassword();
    if (this.confirmationError && this.isSignup) this.confirmationError = this.password === this.confirmation ? "" : "Passwords must match.";
  }

  private validatePassword(): string {
    if (!this.password) return "Enter a password.";
    return "";
  }

  private submit(event: SubmitEvent): void {
    event.preventDefault();
    this.emailError = this.validateEmail(this.email);
    const needsPassword = this.mode === "login" || this.mode === "signup";
    this.passwordError = needsPassword ? this.validatePassword() : "";
    this.confirmationError = this.isSignup && this.password !== this.confirmation ? "Passwords must match." : "";
    if (this.emailError || this.passwordError || this.confirmationError) return;

    const detail: AuthEmailSubmitDetail = this.mode === "forgot"
      ? { email: this.email.trim().toLowerCase(), mode: "forgot" }
      : { email: this.email.trim().toLowerCase(), mode: this.mode, password: this.password };
    this.dispatchEvent(new CustomEvent<AuthEmailSubmitDetail>("auth-email-submit", {
      bubbles: true,
      composed: true,
      detail,
    }));
  }

  private googleShell(): TemplateResult {
    if (this.googleStartUrl) {
      return html`<a class="google" href=${this.googleStartUrl}>Continue with Google</a>`;
    }
    return html`
      <button class="google" type="button" aria-disabled="true" disabled>Continue with Google</button>
      <p class="hint">Google sign-in is unavailable until an API base URL is configured.</p>
    `;
  }

  render(): TemplateResult {
    const emailErrorId = "auth-email-error";
    const confirmationErrorId = "auth-confirmation-error";
    const passwordErrorId = "auth-password-error";
    return html`
      <section aria-labelledby="auth-title">
        <h2 id="auth-title">${this.modeTitle()}</h2>
        ${this.googleShell()}
        <p class="divider">or use your email</p>
        <form @submit=${this.submit} novalidate>
          <label for="auth-email">Email address</label>
          <input id="auth-email" name="email" type="email" autocomplete="email"
            .value=${this.email} @input=${this.onEmailInput}
            aria-invalid=${this.emailError ? "true" : "false"}
            aria-describedby=${this.emailError ? emailErrorId : ""} required />
          ${this.emailError ? html`<p id=${emailErrorId} class="error" role="alert">${this.emailError}</p>` : ""}
          ${this.mode === "login" || this.mode === "signup" ? html`
            <label for="auth-password">Password</label>
            <input id="auth-password" name="password" type="password"
              autocomplete=${this.isSignup ? "new-password" : "current-password"}
              .value=${this.password} @input=${this.onPasswordInput}
              aria-invalid=${this.passwordError ? "true" : "false"}
              aria-describedby=${this.passwordError ? passwordErrorId : ""} required />
            ${this.passwordError ? html`<p id=${passwordErrorId} class="error" role="alert">${this.passwordError}</p>` : ""}
          ` : ""}
          ${this.isSignup ? html`
            <label for="auth-confirmation">Confirm password</label>
            <input id="auth-confirmation" name="confirmation" type="password" autocomplete="new-password"
              .value=${this.confirmation} @input=${this.onConfirmationInput}
              aria-invalid=${this.confirmationError ? "true" : "false"}
              aria-describedby=${this.confirmationError ? confirmationErrorId : ""} required />
            ${this.confirmationError ? html`<p id=${confirmationErrorId} class="error" role="alert">${this.confirmationError}</p>` : ""}
          ` : ""}
          <button type="submit">${this.mode === "forgot" ? "Send reset link" : this.isSignup ? "Create account" : "Continue"}</button>
        </form>
      </section>
    `;
  }
}
