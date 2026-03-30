export interface ParsedCreativeName {
  page: string;
  product: string;
  assetType: string;
  conceptId: string;
  uniqueIdentifier: string;
  category: string;
  angle: string;
  tactic: string;
  hook: string;
  contentType: string;
  language: string;
  creativeOwner: string;
  objective: string;
  landingPage: string;
  launchDate: string;
}

/**
 * Parses ad names following the 15-part pipe-delimited naming convention:
 * Page | Product | Asset Type | Concept ID | Unique Identifier | Category | Angle | Tactic | Hook | Content Type | Language | Creative Owner | Objective | Landing Page | Date
 */
export function parseCreativeName(adName: string): ParsedCreativeName {
  const parts = adName.split(' | ').map((part) => part.trim());

  // Detect whether "Product" field is present (15 parts) or absent (14 parts)
  if (parts.length >= 15) {
    return {
      page: parts[0] || '',
      product: parts[1] || '',
      assetType: parts[2] || '',
      conceptId: parts[3] || '',
      uniqueIdentifier: parts[4] || '',
      category: parts[5] || '',
      angle: parts[6] || '',
      tactic: parts[7] || '',
      hook: parts[8] || '',
      contentType: parts[9] || '',
      language: parts[10] || '',
      creativeOwner: parts[11] || '',
      objective: parts[12] || '',
      landingPage: parts[13] || '',
      launchDate: parts[14] || '',
    };
  }

  // 14-part format: Page | AssetType | ConceptID | UniqueID | Category | Angle | Tactic | Hook | ContentType | Language | Owner | Objective | LandingPage | Date
  return {
    page: parts[0] || '',
    product: '',
    assetType: parts[1] || '',
    conceptId: parts[2] || '',
    uniqueIdentifier: parts[3] || '',
    category: parts[4] || '',
    angle: parts[5] || '',
    tactic: parts[6] || '',
    hook: parts[7] || '',
    contentType: parts[8] || '',
    language: parts[9] || '',
    creativeOwner: parts[10] || '',
    objective: parts[11] || '',
    landingPage: parts[12] || '',
    launchDate: parts[13] || '',
  };
}

/**
 * Checks if an ad name follows the expected naming convention
 */
export function isValidCreativeName(adName: string): boolean {
  const parts = adName.split(' | ');
  return parts.length >= 7; // At minimum should have through Angle
}
