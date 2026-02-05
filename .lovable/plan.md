
# API Endpoint for Creative Performance Data (LLM Integration)

## Overview
Create a new backend function that exposes aggregated creative performance data from all platforms (Meta, Snapchat, TikTok, and Google Ads) in a structured format optimized for LLM consumption and deep research.

---

## What This Enables

- **LLM Integration**: Connect Claude, GPT, Manus, or any other AI tool to analyze your creative performance data
- **Cross-Platform Analysis**: Get blended creative metrics with platform breakdowns in a single API call
- **Deep Research**: AI agents can query historical performance, identify patterns, and generate insights
- **Automation**: Build workflows that automatically analyze and report on creative performance

---

## API Design

### Endpoint
```
POST /functions/v1/creative-insights
```

### Request Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | string | Yes | Start of date range (YYYY-MM-DD) |
| `endDate` | string | Yes | End of date range (YYYY-MM-DD) |
| `platforms` | array | No | Filter to specific platforms: `["meta", "snapchat", "tiktok", "google"]` |
| `limit` | number | No | Max creatives to return (default: 50, max: 200) |
| `sortBy` | string | No | Sort field: `spend`, `installs`, `ctr`, `cpi` (default: spend) |
| `includeBreakdown` | boolean | No | Include per-platform breakdown for blended creatives (default: true) |
| `minSpend` | number | No | Filter out creatives with spend below this threshold |

### Response Structure
```json
{
  "success": true,
  "meta": {
    "dateRange": { "startDate": "2025-01-01", "endDate": "2025-01-31" },
    "platformsQueried": ["meta", "snapchat", "tiktok", "google"],
    "totalCreatives": 47,
    "generatedAt": "2025-02-05T12:00:00Z"
  },
  "totals": {
    "spend": 125000.00,
    "installs": 8500,
    "avgCtr": 0.025,
    "avgCpi": 14.70
  },
  "creatives": [
    {
      "adName": "BrandPage | UGC | Video | CONCEPT001 | Lifestyle | Trust | V1_HERO | Acquisition | CreatorX | Installs | app.com/download | 2025-01-15",
      "metrics": {
        "spend": 5200.00,
        "installs": 380,
        "ctr": 0.032,
        "cpi": 13.68
      },
      "parsed": {
        "page": "BrandPage",
        "contentType": "UGC",
        "assetType": "Video",
        "conceptId": "CONCEPT001",
        "category": "Lifestyle",
        "angle": "Trust",
        "uniqueIdentifier": "V1_HERO",
        "tactic": "Acquisition",
        "creativeOwner": "CreatorX",
        "objective": "Installs",
        "landingPage": "app.com/download",
        "launchDate": "2025-01-15"
      },
      "platformBreakdown": [
        { "platform": "meta", "spend": 3100.00, "installs": 230, "ctr": 0.035, "cpi": 13.48 },
        { "platform": "snapchat", "spend": 1400.00, "installs": 95, "ctr": 0.028, "cpi": 14.74 },
        { "platform": "tiktok", "spend": 700.00, "installs": 55, "ctr": 0.030, "cpi": 12.73 }
      ],
      "platformCount": 3
    }
  ],
  "insights": {
    "topPerformingAngle": "Trust",
    "topPerformingAssetType": "Video",
    "avgCpiByPlatform": {
      "meta": 14.20,
      "snapchat": 15.80,
      "tiktok": 12.50,
      "google": 18.40
    }
  }
}
```

---

## Technical Implementation

### New Edge Function
**File**: `supabase/functions/creative-insights/index.ts`

The function will:
1. Accept date range and optional filters
2. Query BigQuery for each platform in parallel (reusing existing query logic from platform-specific functions)
3. Aggregate creatives by `ad_name` (the naming convention key)
4. Parse each creative name using the 12-part naming convention
5. Calculate blended metrics and platform breakdowns
6. Include pre-computed insights for LLM context

### Data Flow
```text
+------------------+     +-----------------------+
|  LLM / Claude /  | --> |  creative-insights    |
|  Manus / Agent   |     |  Edge Function        |
+------------------+     +-----------------------+
                                   |
            +----------+-----------+-----------+
            |          |           |           |
            v          v           v           v
      +--------+  +--------+  +--------+  +--------+
      |  Meta  |  |  Snap  |  | TikTok |  | Google |
      |   BQ   |  |   BQ   |  |   BQ   |  |   BQ   |
      +--------+  +--------+  +--------+  +--------+
```

### Security
- JWT verification disabled (public API for LLM access)
- Consider adding an optional API key header for authentication if needed later
- Rate limiting handled by Supabase infrastructure

---

## Configuration Update

Add to `supabase/config.toml`:
```toml
[functions.creative-insights]
verify_jwt = false
```

---

## Example LLM Prompts This Enables

Once the API is live, you can use prompts like:

> "Analyze my creative performance from the last 30 days. Which angles are performing best? Are there any creatives that are significantly underperforming their CPI target of $15?"

> "Compare the performance of UGC content vs Produced content across all platforms. Which platform shows the biggest difference?"

> "Identify creatives that are performing well on Meta but poorly on TikTok. What might explain the difference?"

---

## What Gets Created

| File | Description |
|------|-------------|
| `supabase/functions/creative-insights/index.ts` | New edge function with full API implementation |
| `supabase/config.toml` | Updated with new function config |

---

## Future Enhancements (Not in This Plan)

- Add time-series data for trend analysis
- Include creative asset URLs from `creative_assets` table
- Add comparison to previous period metrics
- Implement caching for repeated queries
- Add webhook support for automated reports
