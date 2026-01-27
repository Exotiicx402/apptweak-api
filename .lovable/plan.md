

## Fix: ASC Downloads Edge Function Not Deployed

### Issue
The `asc-downloads` edge function was not successfully created. The function directory doesn't exist in `supabase/functions/` and the config entry is missing from `supabase/config.toml`.

### Root Cause
The previous file creation for `supabase/functions/asc-downloads/index.ts` didn't complete successfully.

### Fix Steps

**Step 1: Create the edge function directory and file**

Create `supabase/functions/asc-downloads/index.ts` with the JWT generation and App Store Connect API integration code.

**Step 2: Update config.toml**

Add the missing entry:
```toml
[functions.asc-downloads]
verify_jwt = false
```

**Step 3: Files to verify exist**
- `src/hooks/useASCDownloads.ts` - React Query hook
- `src/components/ASCDownloadsChart.tsx` - Chart component  
- Dashboard import and usage of ASCDownloadsChart

### Technical Implementation

The edge function needs to:
1. Read `ASC_KEY_ID`, `ASC_ISSUER_ID`, and `ASC_PRIVATE_KEY` from environment
2. Generate ES256 JWT for authentication
3. Call App Store Connect Analytics Reports API
4. Return download data in format: `{ downloads: [{ date, downloads }] }`

### Verification
After deployment, the function should:
- Appear in edge function list
- Return download data when called
- Display in the dashboard chart

