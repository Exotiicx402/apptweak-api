

## Plan: Default to Ad Preview in Creative Dialog

**Change**: In `src/components/reporting/CreativePreviewDialog.tsx`, flip the initial state of `showAdPreview` from `false` to `true` for Meta creatives.

### Details

**File: `src/components/reporting/CreativePreviewDialog.tsx`**

- Change line 230: `const [showAdPreview, setShowAdPreview] = useState(false);`
  → `const [showAdPreview, setShowAdPreview] = useState(true);`

This ensures the dialog opens directly to the Ad Preview iframe (which shows the ad exactly as it appears on Facebook/Instagram), bypassing any thumbnail resolution issues. The Asset tab remains available if the user wants to see/download the raw image.

Grid cards will continue showing thumbnails as before.

