# Running Sheet App — TODO

## Database Schema
- [x] running_sheets table (id, title, description, createdBy, createdAt, updatedAt)
- [x] sheet_rows table (id, sheetId, rowNumber, time, observation, isLocked, createdAt, updatedAt)
- [x] row_members table (id, rowId, memberName, isLocked, createdAt)
- [x] certifications table (id, rowId, memberId, certifiedBy (userId), certifiedAt, isActive)
- [x] audit_logs table (id, sheetId, rowId, userId, action, details, createdAt)

## Backend API (tRPC Routers)
- [x] runningSheet router: list, get, create, update, delete
- [x] sheetRow router: list, create, update, delete
- [x] rowMember router: add, remove
- [x] certification router: certify, uncertify (certifier/admin only)
- [x] auditLog router: list by sheet, list all
- [x] Role enforcement middleware (observer, certifier, admin)

## Frontend Pages & Components
- [x] DashboardLayout with sidebar (Running Sheets, Audit Log, Admin)
- [x] Running Sheets list page
- [x] Running Sheet detail page with 5-column table
- [x] Row with multi-member support (add/remove members)
- [x] Certification button per member with timestamp display
- [x] Locked row visual distinction (muted, lock icon)
- [x] Uncertify button (certifier/admin only)
- [x] Audit Log page with filterable event table
- [x] Admin page: user role management

## Security & Access Control
- [x] Role-based procedure guards (observer, certifier, admin)
- [x] Locked row edit prevention on backend
- [x] Uncertification restricted to certifier/admin
- [x] Audit trail on every certification, uncertification, edit

## Styling & Polish
- [x] Elegant dark/neutral color palette with refined typography
- [x] Locked row visual distinction (background, lock icon, opacity)
- [x] Smooth animations on certification/lock state changes
- [x] Responsive table with horizontal scroll on mobile
- [x] Empty states, loading skeletons, error handling

## Tests
- [x] 22 vitest tests passing (auth, sheet, row, certification, admin, audit log)

## Export Feature
- [x] Backend tRPC endpoint to return full sheet data (rows + members + certifications) for export
- [x] CSV export: generate and download client-side
- [x] PDF export: open print dialog with a styled HTML document (client-side)
- [x] Export button with dropdown (PDF / CSV) on sheet detail page header

## UI & Export Refinements (Round 2)
- [x] Remove Row Number column from the running sheet table
- [x] PDF export: remove row dividers between members in the same row (stack cleanly)
- [x] PDF export: add column dividers
- [x] Narrow the Certify column width in the running sheet table
- [x] Audit Log: add sheet selector (filter by running sheet name)
- [x] Audit Log: add per-sheet PDF export
- [x] Remove CSV export option (PDF only)

## PDF & Structure Refinements (Round 3)
- [x] PDF export: fix column widths — Time and Member as tight as data, Observation fills remaining space
- [x] PDF export: merge Certify + Certified By/At into one compact column
- [x] Add Operations table to DB schema (id, name, description, createdAt)
- [x] Link runningSheets to operations (operationId FK)
- [x] Backend: operations router (create, list, get, delete)
- [x] Home page: list operations with search, click to enter operation
- [x] Operation detail page: list running sheets for that operation, create new sheet within it
- [x] Update navigation and routes for operation hierarchy
- [x] Update audit log sheet selector to show operation > sheet grouping

## Auth & User Profile Overhaul (Round 4)
- [x] Add CIN, unit, username, passwordHash fields to users table
- [x] Add local login endpoint (username + password, bcrypt, JWT session)
- [x] Replace Manus OAuth login page with local username/password login page
- [x] Admin: create user with name, CIN, unit, username, password, access level
- [x] Admin: edit user profile fields
- [x] Admin: delete user
- [x] Admin: reset user password
- [x] Rename "Member" column header to "CIN" in running sheet table
- [x] Rename "Member" column header to "CIN" in PDF export
- [x] Certify column shows CIN number of certifying user (not name)
- [x] CIN shown in audit log entries

## My Profile Page (Round 5)
- [x] Backend: profile.me query (return own user record)
- [x] Backend: profile.updatePassword mutation (verify current password, hash new password)
- [x] Frontend: MyProfilePage with read-only info panel (name, CIN, unit, username, role)
- [x] Frontend: Change Password form with current password + new password + confirm fields
- [x] Sidebar nav: add Profile link accessible to all roles
- [x] Route /profile registered in App.tsx

## Bug Fixes & UX (Round 6)
- [x] Remove minimum length/complexity requirements from username and password fields
- [x] Add light/dark theme toggle accessible from sidebar and profile page
- [x] Fix AdminPage Add User form: inputs lose focus after each keystroke (unstable component key issue)

## Operation & Sheet Form + PDF Cover Page (Round 7)
- [x] DB: add promisNumber, imsNumber, investigationUnit to operations table
- [x] DB: add sheetCins JSON column to running_sheets (array of {cin, hasImages})
- [x] Backend: update operation create/update to accept new fields
- [x] Backend: update sheet create/update to accept sheetCins
- [x] Frontend: Operation dialog — remove description, add PROMIS number, IMS number, Investigation Unit
- [x] Frontend: Running Sheet dialog — remove description, add daily CIN list with images checkbox per CIN
- [x] Frontend: Operation detail page — display PROMIS/IMS/Unit fields
- [x] PDF export: prepend a cover page with operation name, PROMIS, IMS, unit, sheet name, date, and daily CIN list with images indicator

## Edit Operation, Sheet & CIN Roster (Round 8)
- [x] Backend: operation.update procedure (name, PROMIS, IMS, investigationUnit)
- [x] Edit operation: Edit button on Operation Detail page to update name, PROMIS, IMS, Investigation Unit
- [x] Edit running sheet: Edit button on Sheet Detail page to update the sheet title
- [x] Edit daily CIN roster: "Edit Roster" button on Sheet Detail page to add/remove CINs and toggle images flag after sheet creation

## PWA — iOS Installable (Round 9)
- [x] Generate app icons (192x192, 512x512, 180x180 apple-touch-icon)
- [x] Create manifest.json with name, icons, display, theme_color, start_url
- [x] Add iOS-specific meta tags to index.html (apple-mobile-web-app-capable, status-bar-style, touch-icon)
- [x] Register service worker for offline shell caching
- [x] Vite PWA plugin (vite-plugin-pwa) with workbox NetworkFirst for API calls

## Time Picker, Auto-sort & Search (Round 10)
- [x] DB: add timeMinutes INT column to sheet_rows (minutes since midnight, for sorting)
- [x] Backend: sheet.rows query returns rows sorted by timeMinutes ASC
- [x] Backend: row.update accepts timeMinutes alongside time string
- [x] Frontend: replace free-text Time cell with AM/PM time picker popover
- [x] Frontend: rows auto-reorder by time after any time update
- [x] Frontend: search bar above table filters rows by time, observation, or CIN
- [x] PDF export: rows exported in time order, search does not affect export

## Bulk CIN Certification & Team Keyword (Round 11)
- [x] Backend: certification.certifyAllForCin mutation — certify every unlocked row that has a given CIN member across the whole sheet
- [x] Frontend: per-CIN "Certify All" button in the daily roster area of the sheet detail page
- [x] Frontend: "team" keyword in CIN input auto-expands to all CINs on the daily roster for that row
- [x] PDF export: "team" rows show all expanded CINs (auto-handled — expansion happens at add-member time, CINs stored individually), not the word "team"

## Bug Fixes & UX (Round 12)
- [x] CIN deletion: allow removing a CIN from a row even after it has been certified (show delete button on certified members too)
- [x] Per-CIN uncertification in multi-CIN rows: add per-member uncertify (XCircle) button in the Certify column, visible on hover for each certified CIN regardless of row lock state
- [x] Time picker: replace dropdown selects with a scroll-wheel picker covering all 60 minutes (1-minute granularity)

## TEAM Roster Redesign (Round 13)
- [x] Rename "Daily CIN Roster" to "TEAM" throughout (panel, dialogs, PDF, buttons)
- [x] Add Team Leader (TL) checkbox per CIN in TEAM edit dialog — shown with gold star ★
- [x] Add Running Sheet Author checkbox per CIN in TEAM edit dialog — shown with blue pen ✏
- [x] Sort order: Team Leader first, then all CINs numerically/alphabetically
- [x] CIN column in rows: replace free-text input with dropdown of TEAM CINs when TEAM is defined; free-text fallback when no TEAM
- [x] "Add all team CINs" option at bottom of dropdown
- [x] PDF export: TEAM table now includes Team Leader and Author columns
- [x] Sheet cards in OperationDetail: show TL/Author badges with correct sort order
- [x] Backend zod schema updated to include isTeamLeader and isAuthor optional fields

## Shield & Certify Column Redesign (Round 14)
- [x] Shield icon: red = uncertified, green = certified (single toggle button)
- [x] Move shield from CIN column into Certify column
- [x] Shield is the sole certify/uncertify button — tap to certify, tap again to uncertify
- [x] Shield + status (✕ or certifier CIN) centred within the Certify column
- [x] CIN column (MemberCell) shows only CIN text + hover delete button — no shield

## Sheet Card CIN Cert Status (Round 15)
- [x] Remove star/pen/camera icons from CIN badges on sheet cards
- [x] CIN badges: red when that CIN has uncertified rows, green when all rows certified
- [x] Sheet card highlights green (border, background, icon, title) when every CIN is fully certified
- [x] New backend procedure: sheet.cinCertStatus — returns per-CIN certified boolean for a sheet

## To-Do Page (Round 16)
- [x] Backend: procedure to return all uncertified rows for the current user's CIN (rows where user is a member but has no active certification)
- [x] Frontend: TodoPage listing uncertified rows grouped by operation > sheet, with time + observation preview and link to sheet
- [x] Sidebar nav: add "To-Do" item between Operations and Audit Log with a badge count
- [x] Route /todo registered in App.tsx

## New Operation Dialog & Target Profiles (Round 20)
- [x] Remove placeholder/helper text from all New Operation dialog input fields
- [x] Add target_profiles table: operationId, type (TGT/HB/V1/V2/WB), and free-text fields per type
- [x] Backend db helpers and tRPC procedures for target profile CRUD
- [x] Add Target tab/section on OperationDetail page with TGT, HB, V1, V2, WB entry forms

## Target Redesign (Round 21)
- [x] Redesign targets table: one row per target, with name + tgt/hb/v1/v2/wb text fields
- [x] Add targetId FK column to runningSheets table
- [x] Update backend procedures: list/create/update/delete targets; setSheetTarget
- [x] Rebuild Add Target tab: list of targets per operation, each with 5 type fields, + Add Target button
- [x] Add target selector dropdown to SheetDetail page header

## Observation Shortcuts (Round 26)
- [x] DB: shortcuts table (id, trigger, expansion, createdBy, createdAt)
- [x] Seed 4 initial shortcuts: sc, rack, oos, coos
- [x] Backend: tRPC procedures for list/create/update/delete shortcuts
- [x] Auto-expand logic in observation textarea (replace trigger + space with expansion)
- [x] Shortcuts management page (list, add, edit, delete)
- [x] Sidebar nav entry for Shortcuts management

## New Shortcuts (Round 28)
- [x] Add global shortcut: pt → PHOTOGRAPH/S TAKEN (seed into DB)
- [x] Target-aware shortcuts: when a sheet has an assigned target, TGT/HB/V1/V2/WB typed in observation + Space/Tab expand to that target's corresponding field value (only if the field is non-empty)

## Target DEP/ARR Fields (Round 29)
- [x] DB: add dep and arr columns to targets table (migration)
- [x] Backend: include dep/arr in target create/update/list procedures
- [x] Frontend: add Depart (DEP) and Arrive (ARR) form fields on Add Target page
- [x] Frontend: show DEP/ARR in TARGET panel on sheet detail
- [x] Frontend: add DEP/ARR to target-aware shortcuts in observation textarea

## Deep Operations Search (Round 31)
- [x] Backend: tRPC operation.deepSearch procedure — searches operation fields + sheet titles + CINs + target names + observation text
- [x] Frontend: Home page uses deepSearch when query is non-empty, shows match context under each result

## User TEAM Field + Group CIN Selection (Round 32)
- [x] DB: add team column (enum: TEAM1, TEAM2, PTT, nullable) to users table
- [x] Backend: include team in user create/update/list procedures
- [x] Frontend: Add TEAM dropdown to Add New User form (below UNIT)
- [x] Frontend: Show TEAM column in User Management table
- [x] Frontend: Add TEAM 1 / TEAM 2 / PTT group options to CIN add dropdown on running sheet row — expands to all members of that team
- [x] Frontend: Add TEAM 1 / TEAM 2 / PTT group options to New Running Sheet roster — expands to all members of that team

## Intelligence Folder (Round 33)
- [x] Backend: entity extraction utility — parse bracketed entities (persons, vehicles, addresses, businesses) from observation text
- [x] Backend: tRPC intelligence.getEntities procedure — returns all unique entities with occurrence counts, first/last seen, linked sheets
- [x] Backend: tRPC intelligence.getPersonProfile procedure — returns full profile for a named entity (all linked vehicles, addresses, businesses, persons, running sheets)
- [x] Frontend: Intelligence page — list of all persons with search/filter
- [x] Frontend: Person profile view — shows linked vehicles, addresses, businesses, associated persons, running sheets
- [x] Frontend: Selectable sections before PDF export (Running Sheets, Vehicles, Addresses, Persons, Businesses)
- [x] Frontend: PDF export for person profile with only selected sections
- [x] Sidebar nav entry for Intelligence

## RS Governance Folder (Round 34)
- [x] DB: governance_records table (id, sheetId, dueDate, isurv, sentToIO, savedAsWord, savedAsPdf, uploadedToPromis, linked, savedInOpFolder, imageryTaken, coverPage, sheetCell, imageryEntries JSON, notes, createdAt, updatedAt) — no sample data seeded
- [x] DB: migration SQL applied via webdev_execute_sql
- [x] Backend: db helpers for governance CRUD (getBySheetId, upsert)
- [x] Backend: tRPC governance router (get, upsert) — auto-populate from sheet data on first load
- [x] Frontend: GovernancePage — per-sheet checklist with Team Leader and Operative sections
- [x] Frontend: Auto-populate date, operation, team leader, author, target from existing sheet data
- [x] Frontend: Manual tick fields: iSurv, Sent to IO, Saved as Word, Saved as PDF, PROMIS upload, Linked, Saved in Op Folder
- [x] Frontend: Imagery section — imagery entries (name, cell time, photo/vid type, saved)
- [x] Frontend: Due date field (auto-set to sheet date + 7 days, editable)
- [x] Frontend: Governance button on sheet header, Governance sidebar nav item
- [x] Sidebar nav: add Governance link (or accessible from each running sheet)
- [x] Route /governance/:sheetId registered in App.tsx

## Target Form Overhaul (Round 35)
- [x] Add HBF (Home Address Full), V1F (Vehicle 1 Full), V2F (Vehicle 2 Full) columns to targets table schema
- [x] Remove WB (Work) column from targets table schema
- [x] Update db.ts helpers and routers.ts for new/removed target fields
- [x] Make all target form text inputs single-line
- [x] Add HBF above HB, V1F above V1, V2F above V2 in target edit form
- [x] Remove WB field from target edit form
- [x] New fields (HBF, V1F, V2F) appear as shortcuts in observation row form
- [x] New fields (HBF, V1F, V2F) appear in target panel on running sheet
- [x] Add per-target shortcuts section at bottom of target details form

## Target Registry (Round 36)
- [x] Make targets.operationId nullable in schema (targets can exist without an operation)
- [x] Add operation_target_links join table (operationId, targetId) for many-to-many linking
- [x] Update db.ts: add getAllTargetsForRegistry, linkTargetToOperation, getLinkedOperationsForTarget helpers
- [x] Update routers.ts: add target.registry.list, target.registry.create, target.registry.update, target.registry.delete, target.registry.linkToOperation, target.registry.unlinkFromOperation procedures
- [x] Update setSheetTarget to remove same-operation constraint (registry targets can link to any sheet)
- [x] Update deleteOperation to NOT cascade-delete targets (only remove links)
- [x] Build TargetRegistry.tsx page — list all targets, add/edit/delete, show linked operations
- [x] Add "Target Registry" nav item under Intelligence in DashboardLayout sidebar
- [x] Route /target-registry in App.tsx

## To-Do Badge & Access Levels (Round 37)
- [x] Add server procedure: todo.governanceCount — count sheets with incomplete governance for current user
- [x] Update To-Do badge in sidebar to sum certify-outstanding + governance-outstanding counts
- [x] Add 'member' to user role enum in schema (observer | member | admin), run migration
- [x] Backend: enforce Member can only certify their own CIN (block certifying other CINs in certification router)
- [x] Backend: allow Member to bulk uncertify a full row (bulk uncertify stays permitted)
- [x] Frontend: hide User Management nav item and block /admin route for Member role
- [x] Frontend: Member role badge shown in sidebar (green)
- [x] Admin: Member option added to role dropdown in User Management

## Role Cleanup (Round 38)
- [x] Remove 'certifier' role from schema enum, migration, db.ts, routers.ts
- [x] Rename 'member' display label to "Full Access" throughout UI
- [x] Rename 'admin' display label to "Full Access + User Management" throughout UI
- [x] Allow member role to uncertify (unlock) rows their own CIN appears in, even if other CINs are in the row
- [x] Update role dropdown descriptions in User Management

## Governance CIN Tracking (Round 39)
- [x] Add tickedByCIN and tickedByName columns to governance_items table in schema.ts
- [x] Run migration and apply SQL
- [x] Update db.ts: update setGovernanceItemChecked to accept and store tickedByCIN/tickedByName
- [x] Update routers.ts: pass ctx.user CIN and name when toggling governance checkbox
- [x] Update GovernancePage.tsx / governance UI to display CIN next to each ticked checkbox

## Close/Reopen Running Sheet (Round 40)
- [x] Add closedAt (bigint, nullable) and closedByCIN (varchar 50, nullable) columns to running_sheets table in schema.ts
- [x] Run pnpm drizzle-kit generate and apply migration via webdev_execute_sql
- [x] Add closeSheet(sheetId, cin) and reopenSheet(sheetId) db helpers in db.ts
- [x] Add sheet.close and sheet.reopen tRPC procedures in routers.ts (admin or member only)
- [x] Update getRunningSheetById and getRunningSheets to return closedAt and closedByCIN
- [x] SheetDetail: add Close/Reopen button — Close active only when allSigned && governanceComplete; Reopen always available to admin/member
- [x] SheetDetail: when closed, lock all editing (rows, observations, governance, target)
- [x] OperationDetail sheet cards: show faded/muted style + Closed badge with CIN and timestamp when closedAt is set
- [x] Governance page: show locked banner when sheet is closed

## Calendar Feature
- [x] Install react-big-calendar and date-fns localizer
- [x] Backend: tRPC calendar.events query returning operations and running sheets as calendar events
- [x] Frontend: CalendarPage with Month/Week/Day views using react-big-calendar
- [x] Calendar: clicking an event navigates to the relevant operation or running sheet
- [x] Sidebar: add Calendar entry between Target Registry and Court
- [x] Route /calendar registered in App.tsx

## Close Validation & Statement Exclusion Rules (Round 41)
- [x] sheet.close: validate all rows certified before allowing close
- [x] sheet.close: validate governance is 100% before allowing close
- [x] SheetDetail.tsx: surface server error message clearly on close button failure
- [x] Statement exclusion: Travelled Via rule (CIN only in whereat rows after "continued via:" = no statement)
- [x] Statement exclusion: Surveillance Commence/Ceased only rule (CIN only in those rows = no statement)
- [x] StatementsPage: show excluded CINs with reason badge instead of silently omitting

## Copy / Move Running Sheet (Round 42)
- [x] Backend: db helper copyRunningSheet(sheetId, targetOperationId) — deep copies sheet + rows + row_members (no certifications, no governance)
- [x] Backend: db helper moveRunningSheet(sheetId, targetOperationId) — updates operationId on the sheet
- [x] Backend: tRPC sheet.copy and sheet.move procedures (admin/member only)
- [x] Frontend: CopyMoveSheetDialog component — operation search/select dropdown, Copy vs Move toggle
- [x] Frontend: Add copy/move icon button to the left of the trash icon on running sheet cards in OperationDetail.tsx
- [x] Frontend: On success, invalidate operation queries and show toast

## Association Map (Intelligence) (Round 43)
- [x] Install react-force-graph or d3-force for interactive graph rendering
- [x] Backend: tRPC intelligence.getAssociationGraph procedure — returns nodes (persons, vehicles, addresses, businesses) and edges (co-occurrence in same observation/row)
- [x] Frontend: AssociationMap.tsx page — interactive force-directed graph with colour-coded node types
- [x] Graph: click a node to highlight its direct connections and show a detail panel
- [x] Graph: filter by entity type (persons/vehicles/addresses/businesses), operation, or date range
- [x] Graph: zoom, pan, and drag nodes
- [x] Sidebar nav: add "Association Map" under Intelligence section
- [x] Route /association-map registered in App.tsx

## Intelligence Sub-folder Restructure + Association Mapping
- [x] Install react-force-graph-2d for interactive graph rendering
- [x] Backend: tRPC intelligence.getAssociationGraph procedure — returns nodes and weighted edges from entity co-occurrence
- [x] Frontend: AssociationMap.tsx — force-directed graph with operation multi-select, entity type toggles, click-to-highlight, detail panel
- [x] Sidebar: restructure Intelligence into expandable sub-items (Entities, Association Mapping) like To-Do and Court
- [x] Routes: /intelligence/entities and /intelligence/association-map registered in App.tsx
- [x] Redirect /intelligence to /intelligence/entities (old /intelligence route still works)

## Team Leader Close Permission & Notification
- [x] Server: sheet.close restricted to Team Leader CIN (from sheetCins) or admin role
- [x] Server: sheet.reopen remains available to member and admin roles (no change)
- [x] Server: getGovernanceTodoForCin — add "Ready to close" outstanding item for Team Leader when governance is 100% and all rows certified but sheet is not yet closed
- [x] Client: SheetDetail.tsx — canCloseSheet checks if current user CIN matches Team Leader CIN or is admin; show tooltip explaining restriction to others
- [x] Client: TodoGovernancePage — display "Ready to close" items with a distinct style (green/teal)

## Team Leader Close Notification — Always Visible + Governance Percent
- [x] Server: getGovernanceTodoForCin — "Ready to close" now always shown for Team Leader on any open sheet (not just when ready)
- [x] Server: govPercent field added to return type — governance completion percentage passed alongside each Team Leader item
- [x] Client: TodoGovernancePage — governance percent shown as a pill badge next to "Ready to close" (slate=0–49%, sky=50–99%, emerald=100%)
- [x] Client: "Ready to close" text colour changes — sky-400 when not yet at 100%, emerald-400 when fully ready

## Operation Management Feature (Before Court / Archive)
- [x] Schema: add `status` enum column (active/before_court/archive) to operations table
- [x] Schema: add `operation_status_changed` to audit_logs action enum
- [x] Server db.ts: getOperations() filters to active only (main list)
- [x] Server db.ts: getOperationsByStatus(), getAllOperations(), setOperationStatus() helpers
- [x] Server db.ts: setOperationStatus() blocks move if any sheet is open
- [x] Server routers.ts: operation.listByStatus, operation.listAll, operation.setStatus procedures
- [x] Server routers.ts: guardActiveOperation/guardActiveSheet helpers block all mutations on non-active ops
- [x] Server routers.ts: sheet.create/update/delete, row.create/update/delete, member.add/reorder/remove all guarded
- [x] Server db.ts: deepSearchOperations returns operationStatus field
- [x] Client: OperationManagementPage.tsx with Before Court / Archive tabs and status change controls
- [x] Client: App.tsx route /operation-management registered
- [x] Client: DashboardLayout.tsx — Operation Management nav item between Target Registry and Court
- [x] Client: Home.tsx — non-active ops excluded from main list; search results show status badge + redirect
- [x] Governance list uses operation.list (active only) — Before Court/Archive auto-excluded

## AFP Court Statement Generator — Exact Template Match
- [x] Server: statementGenerator.ts rewritten to match AFP template exactly (logo+Statement header, Name/CIN/Occupation/Employer/Date block, STATES:, paragraphs 1–10, signature block)
- [x] Server: Per-sheet image times collected per CIN (rows where CIN is member AND observation contains photo/video keyword)
- [x] Server: surveillanceDays structure (date, isAuthor, imageTimes[]) replaces flat arrays
- [x] Server: Para 9 sub-items — one per running sheet day, with author line and image times line (bold italic) and EXHIBIT label
- [x] Server: Signature block — "Digital signature here" italic, signature line, CIN, date produced
- [x] Server: "continued" footer on all pages
- [x] Server: AFP logo placeholder (loads from server/assets/afp_logo.png if present)
- [x] Upload real AFP logo to server/assets/afp_logo.png when available

## WIPC (Witness Identity Protection Certificates) Subfolder (Round 45)
- [x] Server: statDecGenerator.ts — Statutory Declaration .docx generator (Times New Roman, AFP template)
- [x] Server: wipcRequestGenerator.ts — WIPC Request .docx generator (Arial, AFP template)
- [x] Server: wipc.generateStatDec tRPC procedure (protectedProcedure, returns {filename, base64, producedAt})
- [x] Server: wipc.generateWipcRequest tRPC procedure (protectedProcedure, returns {filename, base64, producedAt})
- [x] Frontend: WIPCPage.tsx — 3-step flow: operation select → document type select → form → generate/download
- [x] Frontend: Stat Dec form fields (declarantFullName, witnessFullName, declarationDate)
- [x] Frontend: WIPC Request form fields (courtDate, courtLocation, commanders, isUrgent, officer details)
- [x] Frontend: Route /court/wipc registered in App.tsx
- [x] Frontend: WIPC nav item added to Court subfolder in DashboardLayout.tsx sidebar (below Witness List)

## Intelligence & Help Guide Fixes (Round 46)
- [x] Fix Intelligence entity profile dialog: running sheet title showing truncated (replace `truncate` with `break-words min-w-0 flex-1`)
- [x] Fix React error #310 (hooks violation) when clicking running sheet link in entity dialog (replace window.location.href with useLocation navigate + setTimeout)
- [x] Update Help Guide: fix delete operation description (button now in Edit dialog, not on card)
- [x] Update Help Guide: add WIPC section (Stat Dec, WIPC Request, vault, member registry)
- [x] Update Help Guide: add Application Security section (auth, roles, audit log, AES-256-GCM)

## Recycle Bin (Round 47)
- [x] DB: add deletedAt (bigint nullable) and deletedByCIN (varchar nullable) to operations, running_sheets, and targets tables; run migration
- [x] Server db.ts: update getOperations, getRunningSheets, getAllTargetsForRegistry to filter out soft-deleted rows
- [x] Server db.ts: add softDeleteOperation, softDeleteSheet, softDeleteTarget helpers
- [x] Server db.ts: add listDeletedItems, reinstateOperation, reinstateSheet, reinstateTarget, purgeExpiredItems helpers
- [x] Server routers.ts: update operation.delete, sheet.delete, target.registry.delete to call soft-delete helpers
- [x] Server routers.ts: add recycleBin.list, recycleBin.reinstate, recycleBin.purge procedures
- [x] Frontend: RecycleBin.tsx page — banner cards per deleted item with type icon, name, deleted date, days remaining, Reinstate button
- [x] Frontend: Add Recycle Bin to sidebar navigation
- [x] Frontend: Route /recycle-bin registered in App.tsx
- [x] Frontend: purge expired items on RecycleBin page load (call recycleBin.purge)

## Intelligence Folder Rebuild — 5 Profile Types (Round 48)
- [x] Server db.ts: getIntelTargetProfile — Direct Links (target card fields) + Operational Links (row-level co-occurrence)
- [x] Server db.ts: getIntelOperationProfile — all entities in an operation with row-level associations
- [x] Server db.ts: getIntelAssociateProfile — associate profile with row-level co-occurrence links
- [x] Server db.ts: getIntelVehicleProfile — vehicle profile with row-level co-occurrence links
- [x] Server db.ts: getIntelLocationProfile — location profile with row-level co-occurrence links
- [x] Server routers.ts: 5 new intelligence procedures (targetProfile, operationProfile, associateProfile, vehicleProfile, locationProfile)
- [x] Frontend: IntelligenceTargetProfile.tsx — target profile page with Direct Links + Operational Links sections + PDF export
- [x] Frontend: IntelligenceOperationProfile.tsx — operation profile page with PDF export
- [x] Frontend: IntelligenceAssociateProfile.tsx — associate profile page with PDF export
- [x] Frontend: IntelligenceVehicleProfile.tsx — vehicle profile page with PDF export
- [x] Frontend: IntelligenceLocationProfile.tsx — location profile page with PDF export
- [x] App.tsx: routes for all 5 profile pages registered
- [x] Intelligence.tsx: Entity interface updated with targetId field; entity card onClick navigates to correct profile page based on entity type
- [x] Server db.ts: IntelligenceEntity interface updated with targetId field; getAllIntelligenceEntities sets targetId on target entities

## Intelligence Entity Extraction — Unbracketed Short-Form Recall (Round 49)
- [x] Server db.ts: getAllIntelligenceEntities upgraded to two-pass per-sheet extraction
- [x] Pass A: build per-sheet entity dictionary from all bracketed introductions (FullForm (ShortForm)) across all rows in the sheet
- [x] Pass B: re-scan every row for unbracketed occurrences of known short forms using word-boundary regex — emits occurrence with original full description and type
- [x] Double-counting prevention: bracketed entities already registered in Pass B are skipped in the unbracketed scan
- [x] TypeScript: 0 errors

## Google Maps Integration (Round 50)
- [x] VITE_GOOGLE_MAPS_API_KEY stored as project secret (Manus proxy handles auth automatically)
- [x] IntelligenceLocationProfile: MapView component added below Associations section
- [x] Geocoder geocodes the location label (with WA fallback) and drops an AdvancedMarkerElement pin
- [x] Map defaults to Perth centre (-31.9505, 115.8605) zoom 12; zooms to 16 on geocode success
- [x] TypeScript: 0 errors

## Intelligence Mapping Sub-folder (Round 51)
- [x] Server db.ts: getIntelMappingLocations — returns deduplicated locations with isTargetAddress flag, linkedTargets (name+vehicles), linkedAssociates, linkedVehicles, filtered by operationIds/targetIds
- [x] Server routers.ts: intelligence.getMappingLocations tRPC procedure
- [x] Frontend: IntelligenceMapping.tsx — full-screen Google Map with side filter panel
- [x] Side panel: Operation multi-select with expand to show targets per operation
- [x] Side panel: Legend (red = target address, purple = observed location, badge = link count)
- [x] Map: Red AdvancedMarkerElement pins for target registered addresses
- [x] Map: Purple AdvancedMarkerElement pins for observation-only locations
- [x] Map: Badge count on each pin showing total number of links
- [x] Map: InfoWindow on pin click — target cards (name, address, vehicles) for red pins; associate/vehicle list for purple pins
- [x] Map: Geocoding of location labels with WA fallback
- [x] DashboardLayout: Intelligence nav item converted to expandable sub-folder with Intel Profiles and Mapping children
- [x] App.tsx: /intelligence/mapping route registered
- [x] TypeScript: 0 errors

## Map Settings Panel + Live User Location (Round 52)
- [x] DB schema: user_locations table (userId unique, lat, lng, operationIds JSON, sharingEnabled, updatedAt bigint)
- [x] DB migration: user_locations table created in TiDB via node script
- [x] Server db.ts: getUserLocations(callerOpIds) — returns sharing-enabled users with operation overlap filter
- [x] Server db.ts: upsertUserLocation(userId, lat, lng, operationIds, sharingEnabled) — insert/update on duplicate key
- [x] Server db.ts: clearUserLocation(userId) — sets sharingEnabled=false
- [x] Server db.ts: getUserLocationState(userId) — returns current sharing state for toggle restore on load
- [x] Server routers.ts: intelligence.userLocations — GET all visible live users (operation-scoped)
- [x] Server routers.ts: intelligence.updateUserLocation — POST upsert caller's location
- [x] Server routers.ts: intelligence.clearUserLocation — POST disable sharing for caller
- [x] Server routers.ts: intelligence.myLocationState — GET caller's current sharing state
- [x] Frontend IntelligenceMapping.tsx: renamed "Filter" panel → "Map Settings" (Settings2 icon)
- [x] Frontend: collapsed panel replaced with left-edge arrow tab (20px wide, vertically centred, ChevronRight) — does not overlap Google map type/satellite controls
- [x] Frontend: click anywhere on map area closes the panel (onClick on map div)
- [x] Frontend: "Share my location" toggle in Map Settings — starts GPS watchPosition, pushes to server
- [x] Frontend: GPS uses navigator.geolocation.watchPosition with high accuracy; clears on toggle off
- [x] Frontend: desktop warning shown if non-mobile device enables sharing
- [x] Frontend: "Show my pin" toggle (only visible when sharing is on) — hides own pin from map
- [x] Frontend: short polling every 15 seconds via refetchInterval on userLocations query
- [x] Frontend: operation-scoped visibility — only users with overlapping selectedOpIds are returned
- [x] Frontend: team colour coding — Team 1 = magenta (#e91e8c), Team 2 = blue (#1976d2), PTT = yellow (#f9a825)
- [x] Frontend: user pins show name in CAPITALS as label tag below pin, initials inside pin
- [x] Frontend: per-team visibility toggles (Show/Hide per team group) in Map Settings panel
- [x] Frontend: per-user visibility toggles (Show/Hide per user) within each team group
- [x] Frontend: unassigned users (no team) shown in a separate group
- [x] Frontend: legend updated with team colour entries
- [x] Admin page: team assignment (TEAM1/TEAM2/PTT) already implemented in User Management — no changes needed
- [x] TypeScript: 0 errors

## Map Location Pin Improvements (Round 53)
- [x] Per-device location tracking (userId + deviceId composite key in user_locations)
- [x] Pill-shaped name tag markers on map
- [x] Motion indicator dot (green=moving, grey=stopped) on left of name tag
- [x] Multiple pins per user when sharing from multiple devices simultaneously
## Mapping Page Bottom Navigation Banner (Round 53b)
- [x] Bottom banner bar on Intelligence Mapping page with permanent Home and Operations links
- [x] 4 flexible quick-link slots (user-configurable)
- [x] Edit mode: user can pick from all available pages/folders for the 4 flexible slots
- [x] Custom quick-links persisted to localStorage
## Mapping Folder Relocation (Round 53c)
- [x] Move Mapping out of Intelligence subfolder into its own top-level sidebar folder
- [x] Place Mapping folder between To-Do and Calendar in DashboardLayout sidebar
- [x] Restore Intelligence folder to original state (Intel Profiles only, no Mapping subfolder)
- [x] Keep same Network icon for Mapping folder
- [x] Update IntelligenceMapping.tsx back-link to no longer reference Intel Profiles parent

## Mapping Page RS Actions Right Pane
- [x] Right-side slide pane (same style as left Map Settings pane) on Mapping page
- [x] Step 1: Choose Operation (dropdown of active operations)
- [x] Step 2: Choose Running Sheet (dropdown filtered by chosen operation)
- [x] Display target shortcut details (DEP, ARR) derived from target linked to chosen RS
- [x] DEP shortcut button: adds observation row with timestamp + DEP expansion text
- [x] ARR shortcut button: adds observation row with timestamp + ARR expansion text
- [x] Other Entry shortcut button: adds observation row with timestamp + "Other entry" text
- [x] Entries use same expansion logic as main running sheet shortcuts
- [x] Entries can be edited later in the full running sheet
- [x] Right pane toggle button on right edge of map (mirror of left pane arrow tab)

## Mapping Page Fixes (Round 54)
- [x] Fix 1: Per-device location sharing — each device is standalone; sharing on = pin shows for that device on all maps
- [x] Fix 2: Right pane click-outside closes it (same as left pane)
- [x] Fix 3: Remove Home button from bottom banner (Home and Operations go to same place)
- [x] Fix 4: Add back-to-map icon/arrow on pages navigated to from bottom banner quick links
- [x] Fix 5: Pill name tag slightly smaller; replace green/grey dot with thin underline (green=moving, grey=stopped)
- [x] Fix 6: Info window entity description text darker (currently light grey, hard to read)
- [x] Fix 7: RS pane sheet title is a clickable link to the full running sheet; add back-to-map icon
- [x] Fix 8: Persist all left and right pane settings in localStorage (ops selected, targets, sharing state)
- [x] Fix 9: Restore sharing/location pin on return to map — if share+show was on, it must stay on

## Duplicate Device Location Fix (Round 55)
- [x] Clean up stale duplicate user_location rows in DB (keep only the most recent per user)
- [x] Fix deviceId generation: use a single stable key per user+browser so it never duplicates
- [x] Add server-side auto-cleanup: delete rows older than 2 hours with sharingEnabled=false on each upsert
- [x] Add a clearAllMyDevices procedure so a user can manually wipe all their stale rows

## Map Bugs (Round 56)
- [x] Fix 1: When no operations are selected, map should show NO markers (currently shows all)
- [x] Fix 2: Returning to map via Back to Map icon should NOT open the left pane automatically
- [x] Fix 3: Name tag must reliably restore when returning to map if sharing was on (no toggle needed)

## RS Actions Pane Improvements (Round 57)
- [x] Compact/redesign right pane layout — smaller text, tighter spacing
- [x] Add "Vehicle Arrive" quick action button (same as Other Entry — adds timestamp row)
- [x] Add "Vehicle Depart" quick action button
- [x] Add "Person Depart" quick action button
- [x] Add "Person Arrive" quick action button

## Stale Sharing Pin Bug (Round 58)
- [x] Fix: user pin shows in Field Units list even when sharing toggle is OFF
- [x] Fix: live users query must only return rows where sharingEnabled = true
- [x] Fix: on page mount, if localStorage says sharing is OFF, immediately clear the DB row for this device
- [x] Clean up all current stale sharingEnabled=true rows in DB

## RS Quick Action Inline Observation Field (Round 59)
- [x] Tapping a quick action button (Vehicle Arrive/Depart, Person Arrive/Depart, Other Entry) opens an inline observation field below the buttons
- [x] Field is pre-filled with the button label text (e.g. "Vehicle arrive")
- [x] User can append free text to the pre-filled text
- [x] Auto-closes and submits after 5 seconds of cursor inactivity inside the field
- [x] Tapping outside the field (anywhere in pane or map) closes and discards the field
- [x] Submit button inside the field to manually confirm immediately

## Location Sharing Root Fix (Round 60)
- [x] Fix getUserLocations filter: sender with empty operationIds should be visible to all viewers (not filtered out)
- [x] Add 90-second server-side expiry: only return rows where updatedAt > now - 90s
- [x] Stable deviceId: use server-assigned persistent cookie token instead of localStorage UUID
- [x] Remove operationIds scoping from visibility — viewer's selection determines what they see, not sender's stored ops
- [x] Clean all stale rows from DB

## Colour-Coded Folder Icons (Round 61)
- [x] Assign a distinct standout colour to every sidebar folder icon in DashboardLayout
- [x] Match bottom map banner quick-link icons to the same coloured sidebar icons

## Location Sharing Fix (Round 62)
- [x] Add unique constraint on (userId, deviceId) in user_locations table via SQL migration
- [x] Update schema.ts to reflect the unique index
- [x] Clean up duplicate rows in DB before adding constraint
- [x] Fix restore-on-navigation: ensure startWatching is called reliably when sharingEnabled=true on mount

## Colour-Coded Folder Icons (Round 61)
- [x] Assign a distinct standout colour to every sidebar folder icon in DashboardLayout
- [x] Match bottom map banner quick-link icons to the same coloured sidebar icons

## Location Sharing Fix (Round 62)
- [x] Clean duplicate user_locations rows in DB
- [x] Add unique index on (userId, deviceId) in user_locations table
- [x] Update schema.ts to declare the unique index
- [x] Fix duplicate pins and duplicate team-list entries (caused by missing unique constraint)
- [x] Fix restore-on-navigation: ensure GPS restarts reliably when sharingEnabled=true on mount
- [x] Fix hide toggle affecting all instances of same user (caused by userId-only hide key)

## Colour-Coded Folder Icons (Round 61)
- [x] Assign a distinct standout colour to every sidebar folder icon in DashboardLayout
- [x] Match bottom map banner quick-link icons to the same coloured sidebar icons

## Right Sidebar Quick-Entry Improvements (Round 63)
- [x] Remove redundant "Open full running sheet" link from RS Actions pane (sheet title is already a link)
- [x] Add CIN picker row below the observation textarea (pill buttons from sheet roster, TL first)
- [x] Add 30-second countdown ring + timer display to inline observation field
- [x] Attach selected CIN as a row member when the quick entry is submitted

## Location Sharing Fix Part 2 (Round 64)
- [x] Fix: receiving device must show other users' pins even when its own sharing toggle is OFF

## Custom Map Markers Feature (Round N)
- [x] Add custom_map_markers table to schema with lat/lng/label/address/operationId/markerIcon/markerColour/note/assocPersons/assocVehicles/targetId
- [x] Generate migration and apply SQL
- [x] Add server db helpers: createCustomMarker, getCustomMarkers, updateCustomMarker, deleteCustomMarker
- [x] Add tRPC procedures: customMarker.create, customMarker.list, customMarker.update, customMarker.delete
- [x] Add tRPC procedures for operation persons/vehicles lookup and add-new
- [x] Build flat SVG marker library module (shared/markerSvgs.ts) with all approved icons in 4 colours
- [x] Add tap-and-hold (mobile) and right-click (laptop) placement triggers on the map
- [x] Build marker placement bottom sheet form UI (icon picker first, then label/address/operation/persons/vehicles/note)
- [x] Render saved custom markers on the map with custom SVG icons
- [x] Build InfoWindow for custom markers with all linked data and action buttons
- [x] Link custom markers to intelligence profiles (target, associate, vehicle, location)

## Custom Map Markers Feature
- [x] Add custom_map_markers table to schema with lat/lng/icon/colour/label/address/note/operationId/assocPersons/assocVehicles
- [x] Generate and apply Drizzle migration for custom_map_markers
- [x] Add db helpers: createCustomMarker, listCustomMarkers, deleteCustomMarker
- [x] Add tRPC customMarker router: create, list, delete procedures
- [x] Build markerSvgs.ts library with all 13 icon types in 4 colours (Red/Yellow/Blue/Purple)
- [x] Add right-click handler on map for desktop marker placement
- [x] Add tap-and-hold (600ms) handler on map for mobile marker placement
- [x] Add reverse geocoding to auto-fill address on placement
- [x] Build marker placement modal with: icon picker, colour picker, label, address, operation, persons, vehicles, note
- [x] Render saved custom markers on map as flat SVG icons with click InfoWindow
- [x] InfoWindow shows label, address, note, persons, vehicles, Waze/StreetView/Delete buttons
- [x] Custom markers poll every 5 seconds for live updates across devices
- [x] Delete custom marker from InfoWindow with confirmation toast
- [x] Add rotation column (INT, default 0) to custom_map_markers schema
- [x] Add rotation dial UI to marker placement form (slider + N/NE/E/SE/S/SW/W/NW presets + live preview)
- [x] Wire rotation into create mutation call
- [x] Apply CSS rotation to rendered custom markers on the map
- [x] Reset rotation to 0 when placement form is opened or submitted
- [x] Soft-delete custom markers to Recycle Bin (7-day retention) — RecycleBin.tsx updated
- [x] Change target-address intelligence map markers from red teardrop pins to red house markers
- [x] Change observation intelligence map markers from teardrop pins to purple house markers
- [x] Add popup edit action for target-address intelligence markers
- [x] Assess and implement the strongest feasible edit flow for observation-derived intelligence markers (View Location Profile button)
- [x] Redesign intelligence map InfoWindow popups (target-address and observation) to match modern custom-marker card style
- [x] Review and fix Google Maps address format extraction in the intelligence scraper
- [x] Add two-option action sheet (RS Quick Entry / Marker) on tap-and-hold and existing marker tap
- [x] RS Quick Entry option: show same quick entry form as right pane, auto-fill address from tapped location, inherit selected operation/sheet from right pane
- [x] Marker option: show existing marker placement form with generated address at top
- [x] Fix single-tap map icon popup text to black (currently hard to read)
- [x] Differentiate action chooser for intel markers (target address / observation): show "RS Quick Entry" + "Intel" (opens existing info popup, data untouched) instead of "RS Quick Entry" + "Marker"
- [x] Blank map tap-and-hold continues to show "RS Quick Entry" + "Marker" as before

## Google Address Auto-Conversion (Round 57)
- [x] Build convertGoogleAddresses() utility in client/src/lib/addressFormat.ts
- [x] Auto-convert Google Maps addresses on paste in running sheet observation textarea (SheetDetail.tsx)
- [x] Auto-convert Google Maps addresses on blur in running sheet observation textarea (SheetDetail.tsx)
- [x] Preserve leading business name when converting (e.g. "McDonald's, 131 Lakey St...")
- [x] Strip postcode and ", Australia" suffix in converted address
- [x] Append bracket code in UPPERCASE at end (e.g. "(131 LAKEY ST)")
- [x] Wire convertGoogleAddresses into mapQeAddress pre-fill in IntelligenceMapping.tsx

## Quick Entry Tile Enhancements (Round 58)
- [x] Tile expansion: tapping a tile expands it to show a free-text observation field + shortcut buttons + CIN multi-select
- [x] Free-text field: if filled, replaces tile label as the observation; if empty, tile label is used as before
- [x] Shortcut buttons in expanded tile (append expanded text in tap order): V1 (target V1F/V1), V2 (target V2F/V2), TGT (target name), DSO (driver and sole occupant), CV (continued via), OOS (out of sight), COOS (continued out of sight)
- [x] CIN buttons: order Team Leader first, then remaining CINs in number order
- [x] CIN buttons: slightly larger and darker font
- [x] CIN buttons: multi-select (tap to toggle, multiple CINs can be selected)
- [x] CIN buttons: TEAM shortcut button that selects all CINs at once

## Google Address Bulk Backfill (Round N)
- [x] Add bulk backfill tRPC procedure to convert Google-formatted addresses in all existing observation rows to RS format
- [x] Add "Fix Google Addresses" button in admin/settings area with result summary (rows scanned, rows updated)

## Visual RS + Intelligence Mapping Rename (Round 59)
- [x] Rename "RS Mapping" to "Intelligence Mapping" in DashboardLayout sidebar
- [x] Rename "RS Mapping" to "Intelligence Mapping" in IntelligenceMapping.tsx page title/header
- [x] Rename "RS Mapping" to "Intelligence Mapping" in map Navigate sidebar panel
- [x] Add Visual RS toggle button to Intelligence Mapping top bar (next to Operation/RS selectors)
- [x] When Visual RS is ON: show persistent popup card on every RS waypoint pin (Time | Address | Observation truncated ~50 chars)
- [x] When Visual RS is OFF: hide all popup cards, return to normal numbered-pin view
- [x] Add Export PDF button (visible when Visual RS is ON): captures map screenshot + RS entries table below
- [x] PDF: map screenshot at top (landscape), RS entries table (Time / Address / Observation) below on same page

## Reports Section — Incomplete/Outstanding Report (Round 65)
- [x] Backend: tRPC reports.incompleteSheets procedure — returns all non-deleted, non-closed sheets with per-sheet status (uncertified row count, governance %, closed status, sheetCins parsed for TL/Author/Certifier/Team)
- [x] Backend: tRPC reports.outstandingTodos procedure — returns per-user outstanding to-do action count (uncertified rows + governance items) ranked descending
- [x] Frontend: ReportsPage.tsx — unified report page with toggleable category panels (Operation, Team, Team Leader, Author, Certifier, Outstanding To-Do Actions)
- [x] Frontend: Team Blended group — RS where members span more than one team shown as separate "Team Blended" group in Team view
- [x] Frontend: Each category panel is independently toggled on/off via a checkbox/button strip at top of page
- [x] Frontend: Each panel shows grouped RS cards with incomplete reason chips (Uncertified rows, Governance %, Not closed)
- [x] Sidebar: Add Reports as first sub-item under Administration folder in DashboardLayout
- [x] Route: /reports registered in App.tsx
- [x] SectionColorContext: /reports maps to administration colour

## Sidebar Drag-to-Reorder (Round 66)
- [x] Install @dnd-kit/core and @dnd-kit/sortable
- [x] DB: add user_sidebar_order table (userId, orderedKeys JSON) or column on users
- [x] tRPC: getSidebarOrder and setSidebarOrder procedures
- [x] DashboardLayout: replace static nav list with SortableContext drag-and-drop list
- [x] Long-press / pointer-down hold (300ms) activates drag on touch devices
- [x] Drag handle shown as subtle grip icon on hover/hold
- [x] Order persisted to DB on drop; falls back to default order for new users
- [x] Administration and User Management always stay at the bottom (pinned, non-draggable)

## Tile Home Screen
- [x] DB: add homeScreenMode ('folder'|'tile') and tileLayout (JSON) columns to user_sidebar_order table
- [x] tRPC: getHomeMode / setHomeMode / getTileLayout / setTileLayout procedures
- [x] TileHomeScreen component: 3-row grid (2 large top row, 4 medium row 2, 4 medium row 3 = 10 total)
- [x] Each tile shows: colour-coded icon, name, live badge count, subtitle info (large only)
- [x] Tiles are draggable across rows; row slot determines display size
- [x] Toggle button in sidebar header switches between Folder and Tile view
- [x] Preference saved per-user; Folder view is default for new users
- [x] Live data: operations count, governance %, to-do count, etc. per tile

## Operation Manager (Main Folder — between Target Registry and Administration)
- [x] DB: op_manager_priority_rows table (weekStart, category, priority, operationId, operationName, team, requestType, sortOrder)
- [x] DB: op_manager_tasking_cells table (weekStart, dayIndex, teamRow, shiftTime, primaryTask, secondaryTask)
- [x] DB: op_manager_supervisor_contacts table (weekStart, role, userId, customName, phone)
- [x] tRPC: getPriorityBoard, savePriorityBoard, getTaskingCalendar, saveTaskingCalendar, getSupervisorContacts, saveSupervisorContacts
- [x] Frontend: OperationManagerPage.tsx with two tabs — Priority Board and Weekly Tasking Calendar
- [x] Priority Board: editable priority table, user-defined categories (A-TACC, WC etc.), operation auto-suggest + inline create, supervisor contacts from user list
- [x] Weekly Tasking Calendar: 7-day grid (Mon-Sun), 4 team rows per day (Surveillance 1, Surveillance 2, PTT, Cap. Support), shift dropdown (RDO/0600-1400/0700-1500/1400-2200/1000-1800/Custom), primary + secondary op per cell
- [x] Inline create operation: if op not found in dropdown, show "Create Operation" option (same flow as Operations folder)
- [x] Week navigation: previous/next week buttons
- [x] Access: Full Access users only can edit
- [x] Sidebar: add Operation Manager as main folder between Target Registry and Administration (with ClipboardList or similar icon)
- [x] Route: /operation-manager registered in App.tsx
- [x] Dashboard tile: add Operation Manager tile to tile home screen (now 11 tiles — adjust layout)
- [x] SectionColorContext: /operation-manager colour mapping

## Operation Manager Enhancements (Round 2)
- [x] Fix: Op Manager missing from main Folder list (Home page folder view)
- [x] Priority Board: Category field → dropdown (A-TACC, WC, Other)
- [x] Priority Board: Operation field → dropdown of active operations + "Add Operation" inline create
- [x] Priority Board: Request Type → multi-select dropdown (Surv, PTT, Capability)
- [x] Weekly Tasking: Custom Time shift → show free-text time input when Custom is selected
- [x] Weekly Tasking: Primary/Secondary task → dropdown of active operations + "Other" (free text) + "Training" at top
- [x] Supervisor Contacts: Role → dropdown (CTO Inspector, Surveillance Team 1, Surveillance Team 2, PTT)
- [x] Supervisor Contacts: Name → dropdown of all users (not free text)
- [x] Supervisor Contacts: Phone → free text (keep as-is)
- [x] New tab: On-Call Supervisor — name dropdown (users), mobile free text, on-call toggle, day selector (individual day or full week)
- [x] Full-page CTO Tasking Week view (read-only summary of all tabs for the selected week) with Edit button to return to edit mode

## Operation Manager Enhancements (Round 3)
- [x] Back button on OperationManagerPage header (navigates to home)
- [x] Contacts layout: On-Call Supervisor section at top of Full View and contacts tab
- [x] Contacts layout: 2-column fixed grid — Left col: CTO Inspector (top), PTT (below); Right col: Surv Team 1 (top), Surv Team 2 (below)
- [x] Shift auto-populate: Surv 1 starts on day shift this week (week of 2026-07-14), alternates each week; Surv 2 opposite
- [x] Day shift defaults: Mon–Fri 0700–1500, Sat–Sun RDO
- [x] Afternoon shift defaults: Mon RDO, Tue–Thu 1400–2200, Fri 1000–1800, Sat–Sun RDO
- [x] PTT and Cap. Support rows: default all days to blank (no auto-fill)
- [x] Save button on Weekly Tasking Calendar tab (manual save in addition to auto-save)
- [x] Previous-week template: when opening a new week with no data, auto-copy previous week as starting template (editable)
- [x] Post & Notify button on Full View — sends push notification to all users ("New CTO Tasking Posted for [week]")
- [x] DB: op_manager_posted_weeks table (weekStart, postedAt, postedBy) to track which weeks have been posted
- [x] tRPC: opManager.postWeek mutation (admin only) — saves posted record + sends notification to all users
- [x] tRPC: opManager.getPostedWeeks query — returns list of posted weekStarts
- [x] Role-based access: only admin/Full Access+User Management can edit; all other users see read-only Full View
- [x] Read-only users: on clicking Op Manager, show current week Full View; can navigate to next week if posted
- [x] No "Add Operation" button shown when no operations exist — show empty state message instead (fix)

## Operation Manager & Mobile Polish (Round 4)
- [x] Full View: each section (On-Call, Supervisor Contacts, Priority Board, Weekly Tasking) as floating card (bg-card, rounded-xl, shadow-md, border)
- [x] Weekly Tasking Calendar edit view: each team row as a floating card per day on mobile
- [x] Full View typography: consistent heading sizes, readable body text, sufficient contrast
- [x] Weekly Tasking table cells: symmetric equal-width columns, consistent padding, break-words (no truncate)
- [x] Mobile layout: DashboardLayout sidebar collapse/overlay on small screens (already works via shadcn SidebarProvider)
- [x] Mobile layout: Operations list page — cards stack cleanly, search bar full-width (verified via screenshot)
- [x] Mobile layout: Running Sheet detail — table has overflow-x-auto wrapper already in place
- [x] Mobile layout: Governance page — checklist items stack cleanly (verified via screenshot)
- [x] Mobile layout: Intelligence page — entity cards stack cleanly (verified via screenshot)
- [x] Mobile layout: Target Registry — cards stack cleanly on mobile (verified via screenshot)
- [x] Mobile layout: Admin/User Management table — hide Unit/Team/Username/LastSignIn on mobile, show Name/CIN/Access/Actions
- [x] Mobile layout: Admin/User Management — form fields stack on mobile (grid-cols-1 sm:grid-cols-2)
- [x] Mobile layout: Op Manager Full View — cards full-width, mobile card-per-team for tasking, stacked priority cards
- [x] Mobile layout: Intelligence profile stats bars — responsive grid (2x2 on mobile, 4-up on desktop)
- [x] Mobile layout: Tile Home Screen row 1 — single column on xs, 2-up on sm+

## Phone Number & Push Notifications (Round 5)
- [x] DB: add phone column (varchar, nullable) to users table
- [x] DB: migration SQL applied via webdev_execute_sql
- [x] Backend: include phone in user create/update/list/me procedures
- [x] Frontend: AdminPage Add/Edit User form — add Phone field (free text, optional)
- [x] Frontend: MyProfilePage — add Phone field (read-only display + edit via profile update)
- [x] Frontend: MyProfilePage — add Enable Notifications button (requests browser push permission, registers subscription via opManager.subscribePush)
- [x] Frontend: MyProfilePage — show notification status (Enabled / Not enabled)
- [x] Op Manager: when user is selected from dropdown in Supervisor Contacts, auto-populate phone from user.phone
- [x] Op Manager: when user is selected from dropdown in On-Call Supervisor, auto-populate mobile from user.phone

## Op Manager Visual Overhaul (Round 6)
- [x] Rename "Surveillance 1" → "Team 1" and "Surveillance 2" → "Team 2" throughout (constants, DB labels, full view, edit view)
- [x] Colour-code team rows: Team 1 = blue, Team 2 = green, PTT = orange, Cap. Support = purple (match map tag colours)
- [x] Floating card per team row in Weekly Tasking edit view (coloured left border + header badge)
- [x] Floating card per team row in Full View tasking table (coloured header row)
- [x] Reorder Full View sections: On-Call → Supervisor Contacts → Priority Board → Weekly Tasking Calendar
- [x] Reorder edit tabs: On-Call → Contacts → Priority Board → Tasking
- [x] On-Call and Supervisor Contacts cards: reduce vertical padding/height to be more compact
- [x] Weekly Tasking Calendar: increase proportional size (takes up more vertical space on page)
- [x] Alternating shift defaults for Team 1/2: Team 1 day shift week of 2026-07-14, Team 2 afternoon; alternates each week
- [x] Copy to Next Week button on Full View: copies all CTO Tasking data from current week to next week
- [x] Modern branded header banner: "CTO Weekly Tasking" with gradient/colour bar, week date range, unit name
- [x] Print/PDF: include the branded header banner, colour-coded team rows, compact contacts, larger tasking grid
- [x] Post & Notify → Re-post & Notify once week has been posted (allows re-sending after edits)

## Op Manager Polish Round 7
- [x] Full View: merge On-Call Supervisors + Supervisor Contacts into one compact single floating card
- [x] Full View: remove the 4-colour accent bar under the hero banner header
- [x] Full View: remove background shading from team name cells in tasking table — team names in colour only, no fill
- [x] Full View: each team row becomes its own individual floating card (not rows in a shared table)
- [x] Full View: team cards sized larger — tasking is the main content, contacts are ancillary
- [x] Full View: fix "Covert Tactics Operations" → "Covert & Technical Operations" in hero banner
- [x] Full View: remove "SENSITIVE — FOR OFFICIAL USE ONLY" text from header
- [x] Priority Board: restore priority number dropdown (#1, #2, #3…) per row
- [x] Fix: Team 1 and Team 2 contacts not saving/displaying correctly in Full View
- [x] Copy to Next Week: swap Team 1/2 shifts (day↔afternoon) using auto-populated defaults for next week
- [x] Copy to Next Week: all other details (contacts, priority board, PTT/Cap.Support tasks) copy as-is

## PDF Export Image Fix (Round 8)
- [x] Fix: embedded images not rendering in the running sheet visual PDF/print export
- [x] Root cause: html2canvas cannot capture cross-origin Google Maps tiles (browser security restriction)
- [x] Fix: server-side tRPC procedure fetches Static Maps API as base64 data URL and returns it to client for embedding

## Visual RS Map Image Fix (Round 9)
- [x] Fix: embedded map image blank/broken in Visual RS PDF export
- [x] Root cause: html2canvas cannot capture cross-origin Google Maps tiles (browser security restriction)
- [x] Fix: added server-side tRPC procedure rsMapping.getStaticMapImage that fetches Google Static Maps API via Manus proxy and returns base64 data URL
- [x] Updated exportVisualRsPdf in RSMappingEmbedded.tsx to call the new procedure instead of html2canvas
- [x] Removed html2canvas import from RSMappingEmbedded.tsx

## Op Manager Polish Round 8
- [x] Full View team cards: remove bold filled header background — team name in colour, coloured border outline only
- [x] Full View On-Call: fix CTO mobile number not displaying (added fallback to user.phone)
- [x] Tasking edit tab: restyle to floating cards matching Full View (coloured border + coloured team name, no filled header)
- [x] Priority Board priority dropdown: limit to 1 and 2 only
- [x] Priority Board category dropdown: change options to A-TACC 1, A-TACC 2, WC, Other
- [x] Print/export Full View: fit entire page on 1 A4 landscape page (scale 0.82 + A4 landscape @page rule)

## Op Manager Polish Round 9
- [x] Print: switch to portrait A4, fit entire full view on 1 page (scale 0.72, 6mm margins)
- [x] Team card borders: lighter/thinner (1px at 60% opacity)
- [x] Table lines inside team cards: heavier (border-border instead of border-border/50)
- [x] Header: removed "Covert & Technical Operations" line, date range now inline right of title
- [x] Shift rotation anchor: moved back 1 week — Team 1 on 1400-2200 this week (13 Jul), 0700-1500 next week (20 Jul)
- [x] PTT: 0600-1400 Mon-Fri, RDO Sat-Sun auto-populated; Cap. Support: 0700-1500 Mon-Fri, RDO Sat-Sun

## Post & Notify Dialog + Build Fix (Round 10)
- [x] Fix production build: sw.ts injectManifest self.__WB_MANIFEST literal preserved
- [x] Post & Notify: open user-selection dialog before sending push notifications
- [x] Dialog: list all users sorted CIN 667 first, then ascending CIN order
- [x] Dialog: checkboxes to select/deselect individual users, Select All toggle
- [x] Server: update postWeek to accept optional list of userIds to notify (sendPushToUsers helper added)

## Op Manager Folder Redesign (Round 11)
- [x] Server: add listAllWeeks procedure returning all weeks that have any saved data (tasking, contacts, or priority), sorted most recent first, with posted status
- [x] Server: add copyWeekData procedure to copy tasking tasks (not shift times), contacts, and priority board from one week to another
- [x] UI: replace Op Manager entry with a folder/list view showing all saved weeks (date range, posted badge, last edited)
- [x] UI: "New CTO Weekly Tasking" button opens a dialog with "Copy Last" or "Create New" options
- [x] UI: Copy Last copies contacts + priority board + task names from most recent week; shift times always come from auto-population
- [x] UI: Create New starts with blank contacts/priority board; shift times auto-populated as always
- [x] UI: clicking a week row opens Full View (admin gets edit button from Full View)
- [x] UI: only Full Access + User Manager users see the New/Edit controls; others see folder list + view only

## Map Target Filter Fix (Round 11 - Jul 14)
- [x] Fix: map showing all targets when running sheet has no target selected
- [x] Root cause: getIntelMappingLocations line 3367 — when filteredTargetIds.size === 0, it returned all targets instead of nothing
- [x] Fix: early return [] when filteredTargetIds is empty after filtering

## Intelligence Bug Fixes (Round 12 - Jul 14)
- [x] Fix: Operations not appearing in Intelligence folder until a target is linked
  - Root cause: OperationsTab derived its list solely from entities (intel extracted from observations); if no observations, no entities → operation never appeared
  - Fix: added trpc.operation.list.useQuery() in IntelligencePage, passed allOps to OperationsTab, seeded opMap with all known operations so ops with 0 entities appear immediately
- [x] Fix: Vehicle display showing full raw text (e.g. "1FDD444 black Subaru WRX, bearing WA registration 1FDD444") instead of clean format
  - Root cause: formatIntelVehicle was prepending rego ("1FDD444") to desc ("1FDD444 black Subaru WRX") even when desc already started with the rego, producing "1FDD444 1FDD444 black Subaru WRX"
  - Fix: added check — if desc.toLowerCase().startsWith(rego.toLowerCase()), return desc directly; also added fallback strip of ", bearing ... registration ..." for non-Vehicle-prefix shortForms

## Map Target Marker Popup Fix (Round 13 - Jul 14)
- [x] Fix: target address marker popup was missing action buttons (rotation slider, RS Quick Entry, Edit Target, Waze, Street View, Edit appearance, Move)
- [x] Root cause: buildInfoWindowContent had an if/else split where observation locations got the full button set but target addresses only got small Waze + Street View links
- [x] Fix: replaced the target address else-branch with the full button set matching the observation popup, including rotation slider, RS Quick Entry, Edit Target (per linked target), Waze/Street View, Edit (appearance), Move

## Visual RS Map Screenshot Fix (Round 14 - Jul 14)
- [x] Fix: Visual RS export was using a separate Google Static Maps API call that produced a different map image (generic pins, different styling) instead of what was on screen
- [x] Fix: Replaced static map API call with html2canvas screenshot of the live map container div, capturing the exact map tiles, route polyline, and custom numbered markers as displayed on screen
- [x] Fix: Map image in print HTML now uses max-height:320px + object-fit:contain so it scales correctly without cropping

## Map Bottom Tab Bar & Quick Entry Improvements (Round 15 - Jul 14)
- [x] Add fixed bottom quick-link tab bar to Intelligence Map: Folders, Active RS, RS Quick Entry + 3 custom (laptop), 2 custom (tablet), 1 custom (mobile)
- [x] Remove RS Quick Entry from the right sliding pane
- [x] Add phrase shortcuts (pt, dso, OOS, coos, rack, etc.) to RS Quick Entry observation field
- [x] Add compact time selector to RS Quick Entry dialog
- [x] Sync left map pane nav order with main menu sidebar order (when main menu order changes, left map pane updates to match)

## Vehicle Format Fix (Intelligence)
- [x] Fix formatIntelVehicle to output: rego colour make model type (e.g. "1DFY345 green BMW X5") — strip "bearing WA registration X (Vehicle X)" suffix, extract rego from bracket or "bearing" pattern, put rego first

## Map Bottom Tab Bar & Quick Entry Overhaul
- [x] Replace bottom tab bar: Folders (fixed), Active RS (fixed, always "Active RS" label), RS Quick Entry (fixed, indigo), 3 custom slots (laptop), 2 custom (tablet), 1 custom (mobile)
- [x] Remove RS Quick Entry collapsible section from right pane
- [x] Add compact time selector to RS Quick Entry modal
- [x] Add shortcut keyboard expansion (Space/Tab) to RS Quick Entry observation textarea
- [x] Sync left map pane nav order with main menu sidebar order

## Map Left Pane — Desktop Fixed Open & Resizable
- [x] On desktop (lg+), left map pane is permanently open (not a slide-in drawer) and resizable via drag handle, same as main sidebar
- [x] On tablet/mobile, left pane remains a slide-in drawer

## Map Quick Entry & Left Pane Fixes (Round 16 - Jul 15)
- [x] RS Quick Entry modal: replace compact HH:MM inputs with the same scroll-wheel time picker used in the main running sheet
- [x] Left map pane (desktop): prevent pane from closing when the map area is clicked — only close on mobile/tablet

## Visual RS Export Map Fix (Round 17 - Jul 15)
- [x] Fix map image not appearing in Visual RS export — html2canvas fails silently due to CORS on Google Maps tiles; replace with reliable Google Static Maps API call passing live map center/zoom/markers

## Intelligence Extraction Fixes (Jul 2026)
- [x] Suppress UM1/UM2/UM3 etc. (and bracketed variants) from being recorded as entities in the intelligence folder
- [x] Fix multi-vehicle extraction: when two vehicles appear in one observation joined by "and a", both are now extracted with correct rego-first formatting (e.g. "1HTU905 white Mitsubishi Triton utility" and "1EAI510 white Mitsubishi SUV")

## Word Export (Jul 2026)
- [x] Add Word (.docx) export option to the running sheet export dropdown alongside PDF
- [x] Word export includes cover page (operation name, PROMIS, IMS, unit, sheet title, date, TEAM roster)
- [x] Word export includes running sheet table (time, observation, CIN, certify columns)
- [x] Word export matches PDF layout/content as closely as possible

## Map Icon & Active RS Indicator (Jul 2026)
- [x] Enlarge the map icon in the top-right of pages (mobile and desktop)
- [x] Add Active RS icon/link next to the map icon — faded when no active RS, highlighted (green) when one is selected in the map pane, clicking navigates to that running sheet
- [x] Active RS state read from localStorage (LS_MAP_SETTINGS_KEY) so DashboardLayout can show it without a context

## Dynamic Vehicles & Wild Fields

- [x] Add extraVehicles (JSON) and wildFields (JSON) columns to targets DB table; migrate existing v2f/v2 data into extraVehicles
- [x] Update server db.ts and routers.ts to persist/return extraVehicles and wildFields
- [x] TargetRegistry: V1F/V1 as sole default; Add Vehicle button creates V2F/V2, V3F/V3 pairs dynamically; Add Wild Field button creates #1, #2… fields
- [x] TargetRegistry AddTargetDialog: same dynamic vehicles and wild fields in create dialog
- [x] SheetDetail shortcutMap: extra vehicles (v2f/v2, v3f/v3…) and wild fields (#1, #2…) injected as shortcuts
- [x] SheetDetail TARGET panel: extra vehicle and wild field rows shown in collapsible target panel
- [x] IntelligenceMapping mapQeShortcutMap: extra vehicles and wild fields injected
- [x] IntelligenceMapping RS Quick Entry chips: V2, V3… and #1, #2… chips appear dynamically when filled in
## Mobile Bottom Bar & Draggable Side Tabs (Jul 2026)
- [x] Mobile/tablet fixed bottom bar: Home (slate), Active RS (emerald), RS Entry (blue), Intel Profiles (violet) — fixed at bottom, hidden on lg+
- [x] Draggable side tabs: left and right collapse tabs can be dragged vertically along the screen edge; position persisted to localStorage
## Operations Dropdown & Map Memory (Jul 2026)
- [x] Right-pane Operations dropdown: auto-collapse after each operation checkbox selection (multi-select but closes per tap)
- [x] Map position memory: map restores last center/zoom on return — saved to localStorage on idle event, read back as initialCenter/initialZoom on mount
## Floating Pills & Coloured Side Tabs (Jul 2026)
- [x] Mobile/tablet bottom bar converted from full-width fixed strip to floating pills (absolute bottom-4, same style as laptop pills — rounded-2xl, shadow, coloured backgrounds)
- [x] Left sidebar collapse tab coloured primary (blue) when pane is closed — acts as a visible call-to-action
- [x] Right Map Settings collapse tab coloured amber/orange when pane is closed — visually distinct from the left tab
## Chip Tap/Drag & Panel Style Fixes (Jul 2026)
- [x] Team panel header style matches target panel: two separate buttons with border-l divider, chevron + pencil placement identical
- [x] SheetDetail chips: tap inserts text into last-focused textarea (focusedTextareaRef), drag reorders — 8px movement threshold distinguishes tap from drag; onMouseDown preventDefault prevents textarea blur on desktop
- [x] Quick Entry modal chips (IntelligenceMapping): same 8px movement threshold — short tap → appendText(), movement → drag reorder; onMouseDown preventDefault prevents input blur on desktop
## Shortcut Chips Overhaul (Jul 2026)
- [x] TGT chip: show trigger only (no target name / expansion text) in both RS main target panel and QE modal
- [x] RS main target panel: all shortcut-folder triggers injected as chips (trigger only, reorderable, replaces hardcoded DSO/D/AR/CV/OOS/COOS list)
- [x] QE modal: all shortcut-folder triggers injected as chips (trigger only, reorderable, replaces hardcoded list)
- [x] Any new shortcut added to the Shortcuts folder automatically appears as a chip in both panels
- [x] All chips remain drag-to-reorder with localStorage persistence
