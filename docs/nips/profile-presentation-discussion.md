# Discussion post draft — Profile Presentation Preferences

> Post this on **nostrhub.io** (and cross-post on Nostr, tagging profile-page
> client devs) to gather feedback and recruit a second implementer BEFORE opening
> a PR to `nostr-protocol/nips`. Nostr evolves on rough consensus + running code;
> the PR should come last, not first.

---

**Proposal: a tiny, portable "profile presentation" record (draft NIP)**

Every client that renders a profile page invents its own layout, and users have
no portable way to express layout intent. If I say "lead with my photos, hide my
long-form, don't show my bio" in one client, that choice is lost the moment I
open another. I'd like to fix that with the smallest possible standard.

**The idea (opt-out, layout-only):** a user-owned [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md)
record (`kind:30078`) under a reserved `d` tag `nostr/profile-presentation`,
whose JSON body just describes section order/visibility (keyed by content event
*kind*) and which well-known profile regions to hide.

```json
{
  "v": 1,
  "sections": [
    { "kind": 20 },
    { "kind": 1 },
    { "kind": 30023, "hidden": true }
  ],
  "hiddenFields": ["bio"]
}
```

Clients that don't implement it just ignore the event and render defaults — zero
breakage. Sections are keyed by content kind, so a client with a different set of
kinds still interprets the subset it knows.

**Deliberately narrow — reuse over reinvention:**
- Featured/pinned content → **NIP-51** (pinned notes / curation sets), not this.
- Self-declared roles/topics → **NIP-32** labels or `kind:0`, not this.
- Identity → `kind:0` / **NIP-39**.
- App-specific stuff (e.g. a trust-ranked "followed-by" row) stays app-private
  NIP-78 data.

**Why `30078` + a reserved `d` tag, not a new kind?** It's a single replaceable
per-user settings object — exactly what parameterized-replaceable NIP-78 data is
for. Minting a new replaceable kind adds coordination cost for no gain. (A
dedicated kind is noted as an alternative in the draft.)

**Running code:** we (Brainstorm) already ship this end-to-end — an owner-only
inline editor that publishes the record and a public profile page that reads and
applies it — today under an app-private `d` tag we'd generalize to the reserved
one. Full draft spec: [link to profile-presentation.md].

**What I'm asking for:**
1. Does layout-portability feel worth standardizing, or is presentation too
   client-specific to bother? (Honest answers welcome.)
2. Is the reserved-`d`-tag-on-30078 approach the right call vs a dedicated kind?
3. **Is any other profile-page client willing to implement it?** A NIP with one
   implementation is fragile — I'd love a second before this goes to a PR.
4. Nits on the `hiddenFields` registry and the "absent kinds append in default
   order" rule.

Not looking to bless our app's schema — looking to find the smallest thing
multiple clients would actually honor. Feedback and pushback both very welcome.
