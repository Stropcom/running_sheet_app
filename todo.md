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
