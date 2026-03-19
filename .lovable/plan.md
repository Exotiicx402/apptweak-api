

## Multi-Select Filter Toolbar for Creative Attributes

### What we're building
A filter toolbar row below the existing platform/asset-type toggles with dropdown buttons for each naming convention attribute. Each dropdown shows checkboxes for every unique value found in the current dataset. Selecting values filters the creative grid to only show matching creatives. Multiple values can be selected per attribute (OR logic within a filter, AND logic across filters).

### Filter dimensions
From the 15-field naming convention, these are the filterable attributes:
- **Angle** -- e.g. "Social Proof", "FOMO"
- **Tactic** -- e.g. "UGC", "Listicle"
- **Hook** -- e.g. "Question", "Bold Claim"
- **Content Type** -- e.g. "VID", "IMG", "CAR"
- **Category** -- e.g. "Sports", "Lifestyle"
- **Objective** -- e.g. "Installs", "Sign Ups"
- **Product** -- e.g. "Hours"
- **Language** -- e.g. "EN", "ES"
- **Creative Owner** -- e.g. "John", "Sarah"

(Page, Concept ID, Unique Identifier, Asset Type, Landing Page, and Date are excluded as they're either IDs or already handled by other controls.)

### UI design
Each filter is a Popover triggered by a button showing the attribute name + count of active selections (e.g. "Angle (2)"). Inside each popover: a scrollable list of checkboxes with all unique values extracted from the current `data` array. A "Clear" link resets that filter. Empty attributes (no values in the dataset) are hidden.

### Files to create/modify

1. **New: `src/components/reporting/AttributeFilterBar.tsx`**
   - Takes `data: EnrichedCreative[]` and `activeFilters` state
   - Extracts unique values per attribute from the data
   - Renders a row of Popover buttons, each with a checkbox list
   - Calls `onFiltersChange` when selections change

2. **Modify: `src/components/reporting/CreativePerformanceGrid.tsx`**
   - Add `activeFilters` state: `Record<string, string[]>`
   - Render `<AttributeFilterBar>` between the platform row and the content
   - Apply filters to `filteredData` -- a creative passes if for every active filter key, its parsed value is in the selected set
   - Update counts (video/image) to reflect filtered data

### Technical detail
- Filter state shape: `{ angle: ["UGC", "FOMO"], hook: [], tactic: ["Listicle"], ... }`
- Unique values extracted via `new Set(data.map(c => c.parsed[key]).filter(Boolean))`
- Filters with empty arrays are ignored (show all)
- The asset type toggle (Image/Video) remains separate as-is

