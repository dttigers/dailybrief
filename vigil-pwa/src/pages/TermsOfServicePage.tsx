/**
 * Phase 126 (AUTH-126-06 / D-04) — Terms of Service page mounted at /legal/terms.
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
export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-gray-900 text-white px-6 py-8">
      <article className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-4">Last updated: 2026-05-11</p>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">Acceptance of Terms</h2>
          <p className="text-gray-300 leading-relaxed">
            By creating a Vigil account or using the Vigil service in any form,
            you agree to these terms. If you do not agree, do not use Vigil.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">Account Eligibility</h2>
          <p className="text-gray-300 leading-relaxed">
            You must be at least 13 years old to create a Vigil account. You are
            responsible for the security of your password and any activity
            performed under your account.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">Acceptable Use</h2>
          <p className="text-gray-300 leading-relaxed">
            You agree not to: send spam or abusive messages through the
            service, attempt to scrape or otherwise automate access without
            written permission, abuse the AI features to generate harmful or
            illegal content, or attempt to compromise the security of the
            service or other users' accounts.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">AI Disclaimer</h2>
          <p className="text-gray-300 leading-relaxed">
            Vigil uses the Claude API (Anthropic) for AI features. AI-generated
            responses are not legal, medical, financial, or other professional
            advice. Use your own judgment and consult a qualified professional
            for decisions that matter. AI output can be wrong, incomplete, or
            biased — verify anything you act on.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">Modifications to Service</h2>
          <p className="text-gray-300 leading-relaxed">
            Vigil may add, change, or remove features at any time. We will give
            reasonable advance notice for changes that materially affect
            existing users (data format changes, removal of major features).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">Termination</h2>
          <p className="text-gray-300 leading-relaxed">
            You may close your account at any time by emailing
            hello@vigilhub.io. We reserve the right to suspend or terminate
            accounts that violate these terms, with notice where practical.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">Limitation of Liability</h2>
          <p className="text-gray-300 leading-relaxed">
            Vigil is provided "as is" without warranty of any kind, express or
            implied. To the maximum extent permitted by law, Vigil and its
            operators are not liable for indirect, incidental, or consequential
            damages arising from your use of the service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">Governing Law</h2>
          <p className="text-gray-300 leading-relaxed">
            These terms are governed by the laws of the State of Colorado,
            United States, without regard to its conflict-of-law provisions.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-6 mb-2">Contact</h2>
          <p className="text-gray-300 leading-relaxed">
            Questions about these terms? Reach us at{' '}
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
