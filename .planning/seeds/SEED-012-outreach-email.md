---
seed_id: SEED-012
purpose: Operator outreach to Even Realities re: dashboard widget API timeline
to: software@evenrealities.com
status: draft (operator sends manually)
drafted: 2026-05-10
---

# Email draft — Dashboard widget API timeline + early access

> Save in Drafts; review tone before sending. Operator can also re-route to
> support@ or developer@ if a more appropriate alias surfaces.

**To:** software@evenrealities.com
**Subject:** Vigil G2 plugin — dashboard widget API timeline + early-access interest?

---

Hi Even Realities team,

I'm Jameson, the developer behind Vigil (`com.vigilapp.g2`) — a G2 plugin
currently in beta review on the Even Hub developer portal at v0.3.6.
Vigil is an ambient AI life-assistant that surfaces work orders,
reminders, daily affirmations, and (new in v0.3.x) live Claude Code
agent activity on the G2 HUD. The plugin runs against my own backend
(api.vigilhub.io) over SSE for sub-2s event delivery.

Quick question on your roadmap: the Even Hub overview docs mention
that the platform is "actively expanding to include Dashboard widgets
and Dashboard layouts." That capability fits Vigil's intended use
case far better than the current plugin model — users want their
agent status, reminders, and work orders to be **always visible** on
the dashboard when they look up, not behind a plugin-selection step.

Two asks:

1. **Timeline.** Is there any public or semi-public guidance on when
   third-party developers can start building dashboard widgets? Even a
   loose "Q3-ish" / "early 2027" would help me plan whether to invest
   more in the current plugin shape or pivot work toward widget
   primitives.

2. **Early access.** If you're running a beta / dev-preview program
   for the widget API, I'd love to be on the list. Vigil is a real
   production plugin with active users (currently me + my immediate
   team) and a non-trivial backend already running, so we'd be a
   useful early-real-world test case rather than a hello-world widget.

For context: Vigil v0.3.6 was just resubmitted addressing the prior
v0.2.0 review feedback (blank-screen issue in the iPhone WebView — now
shows a brand splash). The plugin handles 5 event types
(needs_input / task_failed / task_complete / milestone / heartbeat),
double-tap banner ack on the temple, a Quiet mode toggle (PWA-driven
filter that respects user-controlled DND state), and Last-Event-ID
SSE replay on reconnect.

Happy to share more about Vigil's architecture or pre-screen any
preview screenshots / docs you'd find helpful. Either way, thanks for
shipping G2 + Even Hub — it's a great platform to build on.

Best,
Jameson Morrill
jamesonmorrill1@gmail.com
github.com/dttigers/dailybrief (private — happy to add reviewers on request)

---

## Send-when checklist (operator)

- [ ] v0.3.6 review status: accepted (preferred — landing a "submission
      acknowledged" or "in review" note is fine too, but accepted is
      strongest credibility signal)
- [ ] Re-read once for tone (calm/professional; no marketing speak)
- [ ] Confirm `software@evenrealities.com` is still the right alias
      (verify via Even Hub developer portal contact page)
- [ ] Consider Cc: support@evenrealities.com if there's a separate
      support inbox visible in the dev portal
