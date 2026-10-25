# One80Compass interface specification

## Scope and evidence
Nine reference crops in `references/` come from one AI-generated composition. They are directional visual references, not source code, accurate implementation measurements, or proof of functionality. The exact colors and typography are defined by `design-tokens.css`, adapted from the user's supplied One80Labs slides and Word guides. Screen layout sizes below are recommended implementation choices, not pixel-measured facts. Do not guess illegible labels from the images. Use the labels and behaviors listed here.

## Shared application shell
- Brand must read **One80Compass**, never One80Labs. Use text wordmark unless an authorized actual logo asset is supplied.
- Desktop shell: fixed left navigation 232px wide, thin right border, sticky top bar 64px high. Main area warm ivory with white bordered cards.
- Left rail: Home, Projects; section title `ACTIVE PROJECT`; selected project; nested Project Overview, Project Plan, Kanban Board, Documents, Status Reports; Settings and Help pinned toward bottom.
- Top bar: currently selected customer/project with active state on left and profile/avatar/menu at far right. Display real authenticated user when available.
- Main headings use Source Serif 4; all labels, buttons and data in Figtree. Eyebrows/micro-labels may use JetBrains Mono.
- Main page content max 1360px, 32px inset desktop, 24px on medium screens; surfaces white with 1px #E6E2D8 borders and 14px radius. Avoid heavy shadows, gradients, and saturated cards.
- Terracotta #D97757 for selected tabs, buttons, icons and accents. Use color plus textual labels for status.
- At <=960px, collapse the sidebar to a hamburger/drawer; tables can scroll horizontally; Kanban columns scroll horizontally. Never hide essential actions.
- Basic design system components: AppShell, SidebarNav, TopBar, PageHeader, PrimaryButton, Tabs, Card, StatTile, ProgressBar, StatusBadge, DataTable, EmptyState, ConfirmDialog, ActivityList, DocumentRow, KanbanCard, VersionPanel.

## Screens
1. `01-portal-home.png`: Greeting header with brief subtitle; four tiles Project Overview, Project Plan, Kanban Board, Documents; beneath them project progress card and recent activity list. Project status visible in shell. Tiles are links to real routes.
2. `02-project-overview.png`: Title, Edit Overview action for authorized users, horizontal metadata strip (customer, status, phase, start, target end), two-column description and key goals, sub-tabs (Timeline, Stakeholders, Links, GitHub), simple phase timeline.
3. `03-project-plan.png`: Title, Add milestone action, Timeline/List/Dependencies tabs. Timeline presents phase groups, child tasks, status icons, counts and progress. MVP list view uses real GitHub tasks and point estimates; future Gantt editing is deliberately deferred.
4. `04-kanban-board.png`: Title and Add Task; filter tabs All tasks/My tasks/Due this week, search, filter icon; four columns To Do/In Progress/In Review/Done, each with count and compact task cards. Card shows task name, issue type, date, assignee. GitHub-backed states; don't treat the reference counts as data.
5. `05-documents.png`: Title and Upload document; tabs All documents/Baselines/My uploads; search and filter; compact table Name/Type/Version/Status/Updated/Actions. Rows route to document detail; no fake upload success.
6. `06-document-details.png`: Back to documents, document title, file details, current version selector and actions, tabs Preview/Version history/Baselines/Audit history; file preview area and metadata side panel. Unsupported formats show a downloadable-file preview state rather than fabricated PDF content.
7. `07-status-reports.png`: Title and Create report; All reports/Summary view tabs; report table Period/Status/Progress/Key updates/Published. Publication history is authoritative in AWS.
8. `08-status-report-detail.png`: Back to reports, report title and period, Edit report and Download actions; on-track health panel, progress panel, key updates and upcoming focus. Support draft, review, approved, published states instead of hardcoding green.
9. `09-settings-access.png`: Settings heading; settings subnavigation Project access/General/Notifications/GitHub integration; selected page shows employee access table with role and status, Invite user action. Honor the established customer-wide initial-access rule, rather than inventing granular role privileges.

## Data and behavior
- The sample name `Amur` and sample user are demonstration data only. Use actual project/user data when wired; empty states before data exists.
- UI must not suggest capabilities outside the agreed MVP are implemented. Advanced Gantt drag, baseline approval, version diff, and bulk conflict resolution are later releases.
- Every button must either perform its documented action, navigate to a real route, or visibly indicate unavailable/deferred functionality. No fake working controls.
- Project data must always be scoped and authorized in the backend.

## Visual quality gates
- Test at 1440x900 desktop, 1280x800 laptop, and 390x844 mobile.
- Render and save one screenshot per implemented route at 1440x900, plus representative mobile screenshots.
- Compare sidebar, header, typography, widths, card spacing, table density, alignment, selection states and whitespace against the cropped visual reference.
- Fix major mismatches, then re-screenshot; do not declare visually matched from code inspection alone.
- Color tokens and typography override ambiguous or distorted image details.
- Keep components reusable and avoid hardcoded dimensions on data-content areas.
