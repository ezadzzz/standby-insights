const DETAIL_SLUG_PATTERN = /^\/homes\/([^/]+)\/standby(?:\/|$)/;

/** Extracts the full unit slug from a Standby detail path, or null. */
export function parseSlugFromPath(pathname) {
  const match = DETAIL_SLUG_PATTERN.exec(pathname);
  return match ? match[1] : null;
}

/** Reads the visible unit/property identity from a rendered detail page. */
export function extractVisibleIdentity(doc) {
  const heading = doc.querySelector('h1');
  const propertyLink = doc.querySelector('a[href^="/properties/"]');
  return {
    visibleHeadingText: heading ? heading.textContent : null,
    visiblePropertyLinkText: propertyLink ? propertyLink.textContent : null,
  };
}
