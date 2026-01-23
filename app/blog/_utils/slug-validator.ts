export function isValidBlogSlug(slug: string): boolean {
  if (!slug) return false;

  const normalized = slug.toLowerCase();

  // allow only lowercase letters, numbers, and hyphens
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return false;
  }

  // must contain at least one letter
  return /[a-z]/.test(normalized);
}
