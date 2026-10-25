# Prompt for Cursor Agent

Implement the One80Compass application UI so it closely matches the reference screens in `docs/design/references/`. Read `docs/design/SCREEN_SPEC.md` and `docs/design/design-tokens.css` first, and the existing Product & Technical Specification and Implementation Plan for behavior and MVP scope.

**Name:** One80Compass. Replace any One80Labs product wordmark in the application UI with One80Compass. Do not change the name of the underlying company or unrelated documents unless directed.

**Important:** The images are conceptual compositions. Use the design tokens and screen specification as definitive for ambiguous details. Match layout hierarchy and appearance before polishing individual icons. Never invent functions based on the image alone.

Work in these stages:
1. Inspect the existing React project, app routes, components, CSS and dependencies. Summarize what exists and what will change. Do not overwrite working business logic.
2. Implement centralized design tokens and install/use permitted fonts Source Serif 4, Figtree, JetBrains Mono from package dependencies or legally hosted providers. Use Lucide icons.
3. Implement a reusable AppShell with collapsible left sidebar, topbar, consistent page header, cards, tabs, tables, actions, status badges and responsive rules.
4. Implement the nine screens specified in SCREEN_SPEC.md. Use existing real data when available and explicit example placeholders only for demos. Connect real navigation.
5. Launch the application locally, capture screenshots of every route at 1440x900 (and key routes at mobile). Open the screenshots and visually compare them to the matching `references/0*.png`. Iterate spacing, type size, alignment, card/table density and colors.
6. Report any differences you cannot resolve because the references are ambiguous, and provide screenshot paths. Do not claim pixel-perfect fidelity: the generated source images are approximate and do not include layout code.

Acceptance gates: consistent branding; no major overflow; accessible text contrast and visible focus; core routes and buttons work; visual review done; sample data clearly differentiated from live data; no unrelated backend changes.

Start with **the shared shell and Portal Home**. Show the rendered screenshot for review before building the remaining pages.
