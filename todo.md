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
- [ ] Add HBF (Home Address Full), V1F (Vehicle 1 Full), V2F (Vehicle 2 Full) columns to targets table schema
- [ ] Remove WB (Work) column from targets table schema
- [ ] Update db.ts helpers and routers.ts for new/removed target fields
- [ ] Make all target form text inputs single-line
- [ ] Add HBF above HB, V1F above V1, V2F above V2 in target edit form
- [ ] Remove WB field from target edit form
- [ ] New fields (HBF, V1F, V2F) appear as shortcuts in observation row form
- [ ] New fields (HBF, V1F, V2F) appear in target panel on running sheet
- [ ] Add per-target shortcuts section at bottom of target details form

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
- [ ] Add tickedByCIN and tickedByName columns to governance_items table in schema.ts
- [ ] Run migration and apply SQL
- [ ] Update db.ts: update setGovernanceItemChecked to accept and store tickedByCIN/tickedByName
- [ ] Update routers.ts: pass ctx.user CIN and name when toggling governance checkbox
- [ ] Update GovernancePage.tsx / governance UI to display CIN next to each ticked checkbox

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
- [ ] Install react-big-calendar and date-fns localizer
- [ ] Backend: tRPC calendar.events query returning operations and running sheets as calendar events
- [ ] Frontend: CalendarPage with Month/Week/Day views using react-big-calendar
- [ ] Calendar: clicking an event navigates to the relevant operation or running sheet
- [ ] Sidebar: add Calendar entry between Target Registry and Court
- [ ] Route /calendar registered in App.tsx

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
- [ ] Install react-force-graph or d3-force for interactive graph rendering
- [ ] Backend: tRPC intelligence.getAssociationGraph procedure — returns nodes (persons, vehicles, addresses, businesses) and edges (co-occurrence in same observation/row)
- [ ] Frontend: AssociationMap.tsx page — interactive force-directed graph with colour-coded node types
- [ ] Graph: click a node to highlight its direct connections and show a detail panel
- [ ] Graph: filter by entity type (persons/vehicles/addresses/businesses), operation, or date range
- [ ] Graph: zoom, pan, and drag nodes
- [ ] Sidebar nav: add "Association Map" under Intelligence section
- [ ] Route /association-map registered in App.tsx

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
- [ ] Upload real AFP logo to server/assets/afp_logo.png when available

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
- [ ] DB: add deletedAt (bigint nullable) and deletedByCIN (varchar nullable) to operations, running_sheets, and targets tables; run migration
- [ ] Server db.ts: update getOperations, getRunningSheets, getAllTargetsForRegistry to filter out soft-deleted rows
- [ ] Server db.ts: add softDeleteOperation, softDeleteSheet, softDeleteTarget helpers
- [ ] Server db.ts: add listDeletedItems, reinstateOperation, reinstateSheet, reinstateTarget, purgeExpiredItems helpers
- [ ] Server routers.ts: update operation.delete, sheet.delete, target.registry.delete to call soft-delete helpers
- [ ] Server routers.ts: add recycleBin.list, recycleBin.reinstate, recycleBin.purge procedures
- [ ] Frontend: RecycleBin.tsx page — banner cards per deleted item with type icon, name, deleted date, days remaining, Reinstate button
- [ ] Frontend: Add Recycle Bin to sidebar navigation
- [ ] Frontend: Route /recycle-bin registered in App.tsx
- [ ] Frontend: purge expired items on RecycleBin page load (call recycleBin.purge)

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
- [ ] Add unique constraint on (userId, deviceId) in user_locations table via SQL migration
- [ ] Update schema.ts to reflect the unique index
- [ ] Clean up duplicate rows in DB before adding constraint
- [ ] Fix restore-on-navigation: ensure startWatching is called reliably when sharingEnabled=true on mount

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
- [ ] Add custom_map_markers table to schema with lat/lng/label/address/operationId/markerIcon/markerColour/note/assocPersons/assocVehicles/targetId
- [ ] Generate migration and apply SQL
- [ ] Add server db helpers: createCustomMarker, getCustomMarkers, updateCustomMarker, deleteCustomMarker
- [ ] Add tRPC procedures: customMarker.create, customMarker.list, customMarker.update, customMarker.delete
- [ ] Add tRPC procedures for operation persons/vehicles lookup and add-new
- [ ] Build flat SVG marker library module (shared/markerSvgs.ts) with all approved icons in 4 colours
- [ ] Add tap-and-hold (mobile) and right-click (laptop) placement triggers on the map
- [ ] Build marker placement bottom sheet form UI (icon picker first, then label/address/operation/persons/vehicles/note)
- [ ] Render saved custom markers on the map with custom SVG icons
- [ ] Build InfoWindow for custom markers with all linked data and action buttons
- [ ] Link custom markers to intelligence profiles (target, associate, vehicle, location)

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
- [ ] Add two-option action sheet (RS Quick Entry / Marker) on tap-and-hold and existing marker tap
- [ ] RS Quick Entry option: show same quick entry form as right pane, auto-fill address from tapped location, inherit selected operation/sheet from right pane
- [ ] Marker option: show existing marker placement form with generated address at top
- [ ] Fix single-tap map icon popup text to black (currently hard to read)
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
