import type { BlogPostListItem } from '../_types/blog';

function isValidBlogPost(obj: unknown): obj is BlogPostListItem {
  if (!obj || typeof obj !== 'object') return false;
  const post = obj as Record<string, unknown>;
  return (
    typeof post.slug === 'string' &&
    typeof post.title === 'string' &&
    typeof post.description === 'string' &&
    typeof post.target_keyword === 'string'
  );
}

export default isValidBlogPost;