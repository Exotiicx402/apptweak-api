
# Add Spacing Between Platforms in Slack Report

## Problem

With the percentage change rows now included, the Slack report looks cramped. Each platform's metrics and its percentage change row flows directly into the next platform with no visual separation.

## Solution

Add a blank line between each platform's data block (value row + percentage row) to create visual breathing room.

## Changes

### File: `supabase/functions/slack-daily-report/index.ts`

In the `buildSlackMessage` function, modify the loop that builds rows to add an empty line after each platform's percentage change row:

**Current (lines 186-199):**
```typescript
for (const r of sortedResults) {
  // ... add value row
  rows.push(`${platform}${spend}${installs}${cpi}`);
  
  // Add percentage change row
  if (!r.error) {
    rows.push(`${''.padEnd(16)}${spendChange}${installsChange}${cpiChange}`);
  }
}
```

**Updated:**
```typescript
for (const r of sortedResults) {
  // ... add value row
  rows.push(`${platform}${spend}${installs}${cpi}`);
  
  // Add percentage change row
  if (!r.error) {
    rows.push(`${''.padEnd(16)}${spendChange}${installsChange}${cpiChange}`);
  }
  
  // Add blank line for spacing between platforms
  rows.push('');
}
```

This adds an empty line after each platform block, creating visual separation like:

```text
Platform         Spend        Installs      CPI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Meta             $1,824          90       $20.26
                 -37.1%      -54.3%       +37.6%

Snapchat         $7,048         329       $21.42
                 +43.9%      -13.4%       +66.2%

Unity            $1,819         175       $10.39
...
```

## Result

Each platform's data block will be visually separated by a blank line, making the report easier to scan and read.
