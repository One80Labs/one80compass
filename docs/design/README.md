# One80Compass HTML/CSS reference implementation

This folder is the current visual reference for the portal. It replaced the montage image and the earlier design-handoff kit, which are kept in `docs/archive/` until deleted. Read `CURSOR_HANDOFF.md` before changing the React screens.

This is a **runnable visual and interaction reference**, not a production portal. It contains all nine conceptual screens from the design handoff, implemented with semantic HTML, CSS and vanilla JavaScript. No external build dependencies or backend credentials are needed. Google Fonts will load when online; system-font fallbacks work offline.

## Open it

1. Open `index.html` in a browser, or from this folder run `python3 -m http.server 8080` and visit `http://localhost:8080`.
2. Use left navigation to switch screens. Click documents and status reports to open their detail screens. Move Kanban cards between columns using their status dropdown. Add a task to the local demo. Tabs and search are functional where supported.

## Files

- `index.html`: app entry point.
- `tokens.css`: canonical brand colors, fonts and layout variables from the approved One80Labs guides.
- `styles.css`: complete responsive design implementation (desktop sidebar, cards, tables, columns, mobile).
- `app.js`: route rendering, UI components, demonstration data and interactions.
- `references/`: nine individual crops from the AI-generated reference montage; these are **directional**, not precise measurements.
- `CURSOR_HANDOFF.md`: instructions for building production React components from this reference.

## Screen URLs

`#home`, `#overview`, `#plan`, `#kanban`, `#documents`, `#document-detail`, `#reports`, `#report-detail`, `#settings`. `#projects` is also included as a customer/project selection view.

## Nonfunctional demonstrations and constraints

All people, dates, customer names and project data are **illustrative**. No data leaves your browser. Add Task and Kanban status changes are local in-memory changes (reset on reload). Backend-dependent actions explicitly show a disabled/connection-needed dialog rather than claiming success. The document preview is a **placeholder**, not a real PDF viewer. Status reports are sample data, not actual AWS records. Gantt drag/rebaseline/complex restoration are intentionally outside the MVP reference. Do not mistake demo access-management labels for authorization policy.

## Visual review

Test at 1440×900, 1280×800, and 390×844. Compare each screen to `references/` and tune styles and data for the actual requirements. Production React implementation must enforce tenant isolation on the backend, use Cognito authentication, secure signed file access, and GitHub App server-side synchronization. Avoid attempting to reuse this demo JS as secure application logic.
