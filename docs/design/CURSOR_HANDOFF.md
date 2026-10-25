# Cursor implementation brief for One80Compass

Treat this folder as the **visual source of truth for layout and styling**, in addition to the existing Product & Technical Specification and Phased Implementation Plan for functional requirements. The source files `index.html`, `tokens.css`, `styles.css`, and `app.js` are a working browser reference, not merely descriptions of screenshots.

1. Run this reference locally and capture 1440×900 screenshots for `#home`, `#overview`, `#plan`, `#kanban`, `#documents`, `#document-detail`, `#reports`, `#report-detail`, and `#settings`.
2. Recreate the shared shell as React components: `AppShell`, `Sidebar`, `TopBar`, `PageHeader`, `Card`, `Tabs`, `ProgressBar`, `StatusPill`, `DataTable`, `KanbanColumn`, `TaskCard`, `Modal`.
3. Copy/import `tokens.css` and translate `styles.css` faithfully into application styling. Keep the typography, warm ivory surfaces, 232px sidebar, 64px top bar, compact density, borders, corner radii, selected navigation colors, and responsive breakpoints. **Branding must say One80Compass.**
4. Route and implement every page, replacing demo arrays with authenticated API responses only as the backend becomes available. Distinguish MVP capabilities from future releases. Do not fake integration status or mutation success.
5. **Visual QA required:** capture production-app screenshots at the same viewport sizes, compare side by side to the reference, fix major spacing/typography/layout differences, and repeat until reviewed. Make sure the mobile drawer, horizontal Kanban scroll, tables and main action buttons work.
6. Do not hardcode demo customer/user names into production data. Preserve organization-level access rules and enforce them server-side. Use a GitHub App on the server for synchronization.

Start with the application shell and Home screen. Do not implement all pages before getting the first screen visually close. Do not claim success until the browser screenshots have been inspected.
