

# Add Asset Type Filter (Image / Video / Both) to Creative Performance Grid

## What Changes
Add a toggle filter below the platform filter bar that lets you filter creatives by asset type: **All**, **Images**, or **Videos**. The filter parses the asset type from field 3 of the naming convention (e.g., "Video", "Static", "Carousel").

## Implementation

### 1. Add asset type filter state in `CreativePerformanceGrid.tsx`
- New state: `assetTypeFilter` with values `"all" | "image" | "video"`
- Filter the `data` array before rendering by checking `creative.parsed.assetType` — if it contains "VID" it's video, otherwise image
- Place the filter toggle inline next to the platform filter bar (or right below it), using the existing `ToggleGroup` component with `ImageIcon`, `Film`, and a combined icon for "All"

### 2. Render the filter in `headerContent`
- Add a small `ToggleGroup` after the `PlatformFilterBar` with three options: All, Images, Videos
- Include counts for each type so the user sees how many match

### 3. Apply filter to both card and table views
- Filter `data` before passing to the card grid loop and `CreativePerformanceTable`
- The filtered data flows through the same rendering path, no changes needed in child components

### File changes
- **`src/components/reporting/CreativePerformanceGrid.tsx`** — add state, filter logic, and toggle UI

