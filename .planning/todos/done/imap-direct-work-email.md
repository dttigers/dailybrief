---
title: Direct IMAP to work email instead of Gmail
phase: 18
priority: medium
source: user request
created: 2026-04-03
---

Replace Gmail IMAP with direct connection to work email server. Currently hardcoded to `imap.gmail.com` — make host/port/credentials configurable so it connects directly to work IMAP server (no forwarding to Gmail needed).

**Scope:**
- Make IMAP host/port configurable in config (currently hardcoded `imap.gmail.com:993`)
- Rename `GmailConfig` → `EmailConfig` (or add generic IMAP fields)
- Update Settings UI labels from "Gmail" to "Email" / "IMAP"
- Test with work email server — verify ServiceNow notification parsing still works (format may differ from Gmail-forwarded version)
- May need to adjust search criteria or body parsing if work server presents emails differently

**Why:** Eliminates Gmail as middleman, simpler setup, direct access to work inbox.
