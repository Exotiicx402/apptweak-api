export interface ParsedCreativeName {
  page: string;
  contentType: string;
  assetType: string;
  conceptId: string;
  category: string;
  angle: string;
  uniqueIdentifier: string;
  tactic: string;
  creativeOwner: string;
  objective: string;
  landingPage: string;
  launchDate: string;
}

/**
 * Parses ad names following the 12-part pipe-delimited naming convention:
 * Page | ContentType | AssetType | ConceptID | Category | Angle | UNIQUEIDENTIFIER | Tactic | CreativeOwner | Objective | INPUT-LP-HERE | LaunchDate
 */
export function parseCreativeName(adName: string): ParsedCreativeName {
  const parts = adName.split(' | ').map((part) => part.trim());

  return {
    page: parts[0] || '',
    contentType: parts[1] || '',
    assetType: parts[2] || '',
    conceptId: parts[3] || '',
    category: parts[4] || '',
    angle: parts[5] || '',
    uniqueIdentifier: parts[6] || '',
    tactic: parts[7] || '',
    creativeOwner: parts[8] || '',
    objective: parts[9] || '',
    landingPage: parts[10] || '',
    launchDate: parts[11] || '',
  };
}

/**
 * Checks if an ad name follows the expected naming convention
 */
export function isValidCreativeName(adName: string): boolean {
  const parts = adName.split(' | ');
  return parts.length >= 6; // At minimum should have through Angle
}
