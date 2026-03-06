export async function downloadAsset(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(blobUrl);
}

export function getDownloadUrl(creative: {
  fullAssetUrl: string | null;
  assetUrl: string | null;
}): string | null {
  return creative.fullAssetUrl || creative.assetUrl || null;
}

export function getDownloadFilename(creative: {
  parsed: { uniqueIdentifier: string };
  adId: string;
}): string {
  const base = creative.parsed.uniqueIdentifier || creative.adId;
  return `${base}.png`;
}
