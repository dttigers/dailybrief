/**
 * TurnstileWidget — AUTH-126-02 / D-01
 *
 * Purpose
 *   Client-side Cloudflare Turnstile captcha widget for the /auth/register
 *   signup form. Renders the Cloudflare-managed iframe that issues a short-lived
 *   challenge token to include in the POST /v1/auth/register body.
 *
 * Token lifecycle
 *   - onSuccess(token): widget solved — caller stores token in state (non-null).
 *   - onError(): challenge failed — caller resets token to null.
 *   - onExpire(): token expired — caller resets token to null; Cloudflare will
 *     automatically re-render the widget so the user can solve again.
 *
 * Env var
 *   VITE_TURNSTILE_SITE_KEY — Vercel build-time env var (public, safe to expose).
 *   Obtain from Cloudflare Turnstile dashboard → Sites → your domain.
 *   In local dev: add to vigil-pwa/.env.local. In production: set as Vercel
 *   environment variable. If absent, the widget falls back to a placeholder div
 *   (dev safety — local dev without VITE_TURNSTILE_SITE_KEY won't crash with a
 *   misleading error; the submit button will remain disabled in this state).
 *
 * Consumer contract
 *   1. Caller stores the token in state: `const [turnstileToken, setTurnstileToken] = useState<string | null>(null)`
 *   2. Gate the submit button: `disabled={loading || (!isLogin && !turnstileToken)}`
 *   3. Include in POST body: `JSON.stringify({ email, password, turnstileToken })`
 *   4. Reset token on mode-toggle (toggleMode resets state; widget re-renders on next signup mount).
 */

import { Turnstile } from "@marsidev/react-turnstile"

interface TurnstileWidgetProps {
  /** Called with a token string on solve, null on error/expire. */
  onToken: (token: string | null) => void
}

/**
 * Thin React wrapper around `@marsidev/react-turnstile`'s `<Turnstile>` component.
 *
 * Renders the Cloudflare-managed challenge widget inside a spacing div.
 * Falls back to a visible placeholder when VITE_TURNSTILE_SITE_KEY is missing
 * (operator-dev safety — prevents a misleading "token is null" submit failure
 * in local dev where the key is not configured).
 */
export default function TurnstileWidget({ onToken }: TurnstileWidgetProps) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string

  if (!siteKey) {
    // Dev safety: render a visible placeholder instead of crashing or silently
    // producing a null token that permanently disables the submit button with
    // no explanation. Production must always provide VITE_TURNSTILE_SITE_KEY.
    return (
      <div className="my-3">
        <div className="text-yellow-500 text-sm">Captcha not configured</div>
      </div>
    )
  }

  return (
    <div className="my-3">
      <Turnstile
        siteKey={siteKey}
        onSuccess={(token) => onToken(token)}
        onError={() => onToken(null)}
        onExpire={() => onToken(null)}
        options={{ theme: "dark" }}
      />
    </div>
  )
}
