# In-document dashboard navigation

Customer dashboard menus use history navigation. Plain left-clicks on same-origin
dashboard/admin links also stay in the React document. Modified clicks, new tabs,
downloads, API links and same-page hash anchors retain native browser behavior.

SessionBoundary still checks the real session on every protected path change.
After an initial successful check, customer DashboardPage keeps its layout mounted
and replaces page content with a themed loading state during the next check.
It does not render the old page's content while waiting. A failed check removes
the protected shell; revoked sessions redirect to login. AbortController prevents
late responses from restoring an older navigation.

The shell key includes server-resolved user, organization, workspace and role.
Changing that identity/scope remounts it to discard previous workspace state.
Verified session data is passed down instead of fetching it again on each mount.
This is only a UI lifecycle change: APIs still authenticate and authorize requests.

The full-screen Three.js office keeps its separate lifecycle and iframe; entering
or leaving it still mounts/unmounts the canvas. It is not a second frontend app.
The initial document load may still show a session check and initial splash.

For browser QA without a database, build and run
`node scripts/serve-usage-ui-verification.mjs --slow-session`.
Open `http://127.0.0.1:5221/dashboard/usage`, then change sidebar menus.
Only page content should show loading, not an all-white replacement screen.
