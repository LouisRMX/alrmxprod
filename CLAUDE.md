# alrmx — development notes

Conventions every new feature and every fix in this repo must follow.

## Mobile-first rendering

**Primary device in GCC is a smartphone (iPhone/Android in portrait).** Every page must render cleanly at ~375 px viewport width without horizontal scroll, cut-off content, or layout breakage. Desktop layouts enhance mobile layouts, not the other way around.

### Rules

1. **Never** set a fixed `minWidth` on a table without a responsive fallback. If the table has more than ~3 short columns, build a mobile card layout via `useIsMobile` instead of relying on `overflowX: auto`. Horizontal scroll on mobile is acceptable only when the data is genuinely comparative (e.g. the portfolio Compare view). Add a visible `← Scroll sideways →` hint when you do.

2. **Grids must collapse.** For any multi-column grid, use `gridTemplateColumns: 'repeat(auto-fit, minmax(Xpx, 1fr))'` rather than hardcoded `1fr 1fr` or `repeat(3, 1fr)`. Pick `X` so two columns fit on desktop (~360 px each) and one fits on mobile (~320 px).

   ```ts
   // ✗ Bad
   gridTemplateColumns: '1fr 1fr'
   // ✓ Good
   gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
   ```

3. **Tap targets ≥ 44 px.** Buttons, table rows, chips must have `minHeight: '44px'` or enough padding that the rendered height is at least 44 px. iOS HIG minimum.

4. **Prefer `clamp()` or viewport units for page padding.**

   ```ts
   // ✗ Bad
   padding: '24px'
   // ✓ Good
   padding: 'clamp(12px, 3vw, 24px)'
   ```

5. **Modals and dialogs must breathe on mobile.** Use `width: '90%'` combined with `maxWidth: 'XXXpx'` so the dialog leaves visual margin on narrow viewports. Don't use `width: 'min(600px, 100vw)'` — on mobile that becomes full-viewport and hides the background.

6. **Charts need `ResponsiveContainer`.** Every Recharts chart must be wrapped in `<ResponsiveContainer width="100%" height={200}>` with a fixed height but fluid width. Fixed-width charts overflow on narrow viewports.

7. **The `useIsMobile` hook** (`src/hooks/useIsMobile.ts`) returns `true` below 640 px. Use it when conditional rendering is the simplest solution (e.g. cards vs table). Don't use CSS media queries in inline styles (they don't work).

8. **Test every new page on a real 375 px viewport** before merging. Chrome devtools iPhone SE preset is fine for a first check. The on-site manager in Riyadh will open this on the phone, not the laptop.

### Common offenders (fixed 2026-04-21)

| Pattern | Where | Fix |
|---|---|---|
| Table `minWidth: '600px'` | Customers page | Extracted to `CustomerList.tsx` with mobile card view |
| Table `minWidth: '700px'` | Portfolio page | Extracted to `PortfolioList.tsx` with mobile card view |
| Table `minWidth: '680px'` | Compare view | Kept as table + added scroll hint (genuinely comparative data) |
| Chips with `minWidth: '140px' × 3` | Compare summary | `gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)'` |
| `1fr 1fr` in forms | AddCustomer, CustomerDetail, NewAssessment | `repeat(auto-fit, minmax(220px, 1fr))` |
| `repeat(4, 1fr)` | Simulator baseline grid | `repeat(auto-fit, minmax(160px, 1fr))` |
| 6-7 px padding on TripTable | Field Log trip list | Bumped to 10-12 px for tap comfort |

## Other conventions

- **No emojis in files** unless the user explicitly asks. The app has plenty of Unicode symbols (⏱ 📊 ⚙) because they carry navigational meaning — distinguish these from decorative emojis which are not wanted.
- **No em-dashes** in user-facing strings per Louis preference. Use commas, periods, or reword.
- **Arabic strings** in `src/lib/i18n/log-catalog.ts` have been native-reviewed. Don't change existing Arabic without flagging.
- **Western Arabic numerals** (0-9) are used throughout the Arabic catalog, not Arabic-Indic (٠-٩), per existing convention documented in the catalog file header.
- **Push direct to `main`** — no PR overhead on this solo project. TypeScript check runs in pre-push hook.
- **Migration files in `supabase/migrations/`** must be idempotent (use `IF EXISTS`, `IF NOT EXISTS`, `DROP ... IF EXISTS` before `CREATE`). Louis may re-run them as the schema evolves.
- **RLS policies use JWT `app_metadata` for admin checks**, never `SELECT FROM profiles` — the latter causes infinite recursion. Pattern:
  ```sql
  USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin')
  ```
