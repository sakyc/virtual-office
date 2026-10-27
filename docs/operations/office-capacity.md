# Office capacity and upgrade prompts

The nine physical room shells remain unchanged. The current scene supports up
to eight configured divisions; the extra room is not a new subscription benefit.

`GET /api/team` returns `divisionCapacity` from the authenticated organization's
active subscription, subtracting active divisions in other active workspaces
and clamping to the existing scene limit. Missing/expired subscriptions yield
zero. A query failure returns the existing unavailable response, not free capacity.
No plan prices or capacities are hardcoded in the office client.

Existing divisions keep their positions and content. They consume capacity first;
remaining capacity opens empty rooms. A downgrade never deletes or relocates
existing divisions. This visual treatment does not replace server authorization
or the existing paid-mutation gate.

Locked rooms contain no agents. Clicking the room geometry or its navigation chip
opens a native modal with Escape, focus containment and a link to
`/dashboard/billing`. Embedded navigation checks the exact iframe source, origin
and path allowlist. Viewing the modal never purchases or changes a subscription.
Only the organization's owner/admin can manage billing under existing policy.

Browser QA: build, then run
`node scripts/serve-office-lock-ui-fixture.mjs --capacity=3` (or `1`).
Open `http://127.0.0.1:5225/office.html?tenant=1`.
This loopback-only fixture contains no users, database or paid provider calls;
its billing destination is an explicitly marked test page. Send `stop` to exit.
