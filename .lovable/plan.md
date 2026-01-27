

## App Store Connect Downloads Chart Implementation

### Overview
Add Apple's official App Store Connect (ASC) exact download data as a new 7-day line chart below the AppTweak data section on the dashboard.

### Step 1: Add Required Secrets

Three secrets need to be configured:

| Secret Name | Value |
|------------|-------|
| `ASC_KEY_ID` | `BJMJP9LMM8` |
| `ASC_ISSUER_ID` | `776563b8-6094-40a4-a534-cd5faad77bd2` |
| `ASC_PRIVATE_KEY` | Full content of AuthKey_BJMJP9LMM8.p8 file |

### Step 2: Create Edge Function

**New file: `supabase/functions/asc-downloads/index.ts`**

- Generate JWT token using ES256 algorithm with the private key
- Call App Store Connect Analytics Reports API
- Fetch daily download data for last 7 days
- Return data matching existing format: `{ downloads: [{ date, downloads }] }`

### Step 3: Create React Hook

**New file: `src/hooks/useASCDownloads.ts`**

- React Query hook calling the edge function
- Same pattern as existing `useAppsFlyerDownloads` hook
- Returns `{ data, isLoading, error }`

### Step 4: Create Chart Component

**New file: `src/components/ASCDownloadsChart.tsx`**

- Line chart matching existing `DownloadsHistoryChart` style
- Badge labeled "App Store Connect"
- Shows total and average downloads
- 7-day responsive line chart

### Step 5: Update Dashboard

**Update: `src/components/Dashboard.tsx`**

Add new section between AppTweak and AppsFlyer:

```
├── AppTweak Data (existing)
│   └── DownloadsHistoryChart
├── App Store Connect (Official) ← NEW
│   └── ASCDownloadsChart
└── AppsFlyer SSOT (existing)
    └── AppsFlyerDownloadsChart
```

### Technical Details

**JWT Generation:**
- Algorithm: ES256
- Header: `{ alg: "ES256", kid: "BJMJP9LMM8", typ: "JWT" }`
- Payload: `{ iss: ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" }`

**API Endpoint:**
`https://api.appstoreconnect.apple.com/v1/analyticsReportRequests`

**Data Notes:**
- App Store Connect data typically has 24-48 hour delay
- This is deterministic, 100% accurate data from Apple

