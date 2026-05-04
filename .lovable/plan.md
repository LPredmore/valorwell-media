## Fix browser DOM warnings on Login and Settings → Profile

These are non-blocking Chrome hints that improve password-manager behavior and accessibility. No functional change.

### 1. `src/pages/Login.tsx`
- Add `autoComplete="email"` to the email input.
- Add `autoComplete="current-password"` to the password input.
- (The form already exists, so no wrapping needed.)

### 2. `src/components/settings/ProfileView.tsx`
Wrap each of the three credential cards' inputs in a `<form>` so the password fields are inside a form (Chrome requirement for password managers):

- **Display name card** → wrap inputs+button in `<form onSubmit={(e) => { e.preventDefault(); handleSaveDisplayName(); }}>`.
- **Email card** → wrap in `<form onSubmit={(e) => { e.preventDefault(); handleSaveEmail(); }}>`.
- **Password card** → wrap in `<form onSubmit={(e) => { e.preventDefault(); handleSavePassword(); }}>`. Change the submit button to `type="submit"` and the other two buttons stay `type="button"` (or convert their handlers to onSubmit too).
- Add a hidden `<input type="email" autoComplete="username" value={user?.email ?? ""} readOnly hidden />` inside the password form so password managers can associate the new password with the correct account (Chrome best practice).

### 3. Ignore the `reveal-fly-secrets` console error
That function was intentionally deleted after one-time use. The snippet you pasted in the console is from earlier instructions and shouldn't be re-run. No code change needed.

### Out of scope
- No changes to auth logic, validation, or styling.
- No changes to any edge function.

### Files touched
- `src/pages/Login.tsx`
- `src/components/settings/ProfileView.tsx`
