/**
 * Phase 126 (AUTH-126-06 / D-04) — Privacy Policy page mounted at /legal/privacy.
 *
 * Hand-rolled per CONTEXT line 109 (Termly hosted would add CSP+iframe complexity).
 * Lawyer review recommended within 30 days post-revenue.
 *
 * Public route — mounted as a SIBLING of /auth/forgot|reset|verify in App.tsx,
 * OUTSIDE the isAuthenticated guard. Plan 126-10 wires footer Link consumption
 * from the AuthPage signup screen.
 *
 * Stateless presentational component: no fetches, no useState, no router hooks.
 * Surviving when /v1/* is down is intentional (T-126-08-06 mitigate-by-design).
 */
export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-gray-900 text-white px-6 py-8">
      <article className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-4">Last updated: 2026-05-11</p>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">Data We Collect</h2>
          <p className="text-gray-300 leading-relaxed">
            When you create a Vigil account we store your email address (for
            account identification and authentication) and a one-way encrypted
            hash of your password (we cannot read your password). While you use
            the product we record app-usage events (PostHog) and uncaught error
            stack traces (Sentry) so we can keep the service healthy. If you
            install the claude-code-companion vigil-watch daemon on your Mac,
            it sends agent-events (session lifecycle, milestone counts) to your
            account so the G2 Companion HUD can render them.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">How We Use Your Data</h2>
          <p className="text-gray-300 leading-relaxed">
            We use the data above to provide the Vigil service, fix bugs (Sentry
            stack traces tell us what broke), and measure product usage in
            aggregate (PostHog tells us which features are used). We never sell
            or rent your data to any third party.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">Third-Party Services</h2>
          <p className="text-gray-300 leading-relaxed">
            Vigil sends data to the following processors to deliver the service:
            Anthropic (Claude API requests are proxied through our backend for
            AI features), Cloudflare Turnstile (signup anti-bot challenge),
            Resend (transactional email — verification + password reset),
            PostHog and Sentry (error and usage telemetry), Railway (backend
            hosting), and Vercel (PWA hosting). Each processor sees only the
            minimum data required to perform its function.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">Data Retention</h2>
          <p className="text-gray-300 leading-relaxed">
            Account data is retained until you request deletion. Request logs are
            purged at 30 days. Sentry events are retained for 90 days by default
            (Sentry's standard retention).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">Your Rights</h2>
          <p className="text-gray-300 leading-relaxed">
            To request a data export or account deletion, email
            hello@vigilhub.io. A self-serve GDPR/CCPA endpoint is on the
            roadmap; until it ships, the email request is the canonical
            channel and we respond within a reasonable timeframe.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">Contact</h2>
          <p className="text-gray-300 leading-relaxed">
            Questions about this policy or your data? Reach us at{' '}
            <a href="mailto:hello@vigilhub.io" className="text-teal-400 hover:text-teal-300 underline">
              hello@vigilhub.io
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  )
}
