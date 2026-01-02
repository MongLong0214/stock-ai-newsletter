/**
 * 블로그 목록 클라이언트 컴포넌트
 * - Virtualized rendering for 300+ posts
 * - Chunked initial render to prevent main thread blocking
 */
'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import BlogCard from './blog-card';
import { EmptyState } from './empty-state';
import { SearchBar } from '../filters/search-bar';
import { TagFilter } from '../filters/tag-filter';
import { ActiveFilters } from '../filters/active-filters';
import { useDebounce } from '../../_hooks/use-debounce';
import type { BlogPostListItem } from '../../_types/blog';

const DEBOUNCE_MS = 300;
const INITIAL_RENDER_COUNT = 9;
const LOAD_MORE_COUNT = 9;
const SCROLL_THRESHOLD = 200;

const HEADER_ANIMATION = {
  SEARCH_BAR_DELAY: 100,
  TAG_FILTER_DELAY: 200,
} as const;

interface BlogListClientProps {
  posts: BlogPostListItem[];
}

export default function BlogListClient({ posts }: BlogListClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_COUNT);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const debouncedSearch = useDebounce(searchQuery, DEBOUNCE_MS);
  const isSearching = searchQuery !== debouncedSearch;

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      post.tags?.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [posts]);

  const filteredPosts = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();

    return posts
      .filter((post) => {
        if (query) {
          const searchable = [post.title, post.description, post.target_keyword]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!searchable.includes(query)) return false;
        }
        if (selectedTags.size > 0) {
          const hasAllTags = [...selectedTags].every((tag) => post.tags?.includes(tag));
          if (!hasAllTags) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dateA = new Date(a.published_at ?? 0).getTime();
        const dateB = new Date(b.published_at ?? 0).getTime();
        return dateB - dateA;
      });
  }, [posts, debouncedSearch, selectedTags]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(INITIAL_RENDER_COUNT);
  }, [debouncedSearch, selectedTags]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < filteredPosts.length) {
          setVisibleCount((prev) => Math.min(prev + LOAD_MORE_COUNT, filteredPosts.length));
        }
      },
      { rootMargin: `${SCROLL_THRESHOLD}px` }
    );

    const target = loadMoreRef.current;
    if (target) observer.observe(target);

    return () => {
      if (target) observer.unobserve(target);
    };
  }, [visibleCount, filteredPosts.length]);

  const handleTagToggle = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedTags(new Set());
  }, []);

  const hasActiveFilters = debouncedSearch.trim() || selectedTags.size > 0;
  const visiblePosts = filteredPosts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredPosts.length;

  return (
    <div className="space-y-12">
      <div className="space-y-6">
        <div className="animate-fade-in-up" style={{ animationDelay: `${HEADER_ANIMATION.SEARCH_BAR_DELAY}ms` }}>
          <SearchBar value={searchQuery} onChange={setSearchQuery} isSearching={isSearching} />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: `${HEADER_ANIMATION.TAG_FILTER_DELAY}ms` }}>
          <TagFilter tags={allTags} selectedTags={selectedTags} onToggle={handleTagToggle} />
        </div>
        {hasActiveFilters && <ActiveFilters resultCount={filteredPosts.length} onClear={handleClearFilters} />}
      </div>

      <section aria-label="블로그 글 목록" aria-busy={isSearching} aria-live="polite" className="relative">
        {!isSearching && filteredPosts.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {visiblePosts.map((post, index) => (
                <BlogCard key={post.slug} post={post} index={index} />
              ))}
            </div>

            {/* Infinite scroll trigger */}
            {hasMore && (
              <div ref={loadMoreRef} className="flex justify-center py-12">
                <div className="flex items-center gap-2 text-gray-500">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-sm">Loading more...</span>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}