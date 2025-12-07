/**
 * 블로그 목록 클라이언트 컴포넌트
 */
'use client';

import { useState, useMemo, useCallback } from 'react';
import BlogCard from './blog-card';
import { EmptyState } from './empty-state';
import { SearchBar } from '../filters/search-bar';
import { TagFilter } from '../filters/tag-filter';
import { ActiveFilters } from '../filters/active-filters';
import { useDebounce } from '../../_hooks/use-debounce';
import type { BlogPostListItem } from '../../_types/blog';

/** 검색어 입력 Debounce 시간 (밀리초) */
const DEBOUNCE_MS = 300;

interface BlogListClientProps {
  /** 서버에서 전달받은 블로그 포스트 목록 */
  posts: BlogPostListItem[];
}

export default function BlogListClient({ posts }: BlogListClientProps) {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  // Debounced 검색
  const debouncedSearch = useDebounce(searchQuery, DEBOUNCE_MS);
  const isSearching = searchQuery !== debouncedSearch;

  /**
   * 태그 집계 (출현 빈도순 정렬)
   * - Map 사용으로 O(n) 복잡도
   */
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      post.tags?.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [posts]);

  /**
   * 검색어 + 태그 필터링 + 정렬
   * - 검색어: title, description, target_keyword에서 검색
   * - 태그: 선택된 모든 태그 포함 (AND 조건)
   * - 정렬: 발행일 기준 내림차순
   */
  const filteredPosts = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();

    return posts
      .filter((post) => {
        // 검색어 필터링
        if (query) {
          const searchable = [post.title, post.description, post.target_keyword]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!searchable.includes(query)) return false;
        }

        // 태그 필터링
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

  /** 태그 선택/해제 */
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

  /** 필터 초기화 */
  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedTags(new Set());
  }, []);

  const hasActiveFilters = debouncedSearch.trim() || selectedTags.size > 0;

  return (
    <div className="space-y-12">
      {/* 필터 영역 */}
      <div className="space-y-6">
        <SearchBar value={searchQuery} onChange={setSearchQuery} isSearching={isSearching} />
        <TagFilter tags={allTags} selectedTags={selectedTags} onToggle={handleTagToggle} />
        {hasActiveFilters && <ActiveFilters resultCount={filteredPosts.length} onClear={handleClearFilters} />}
      </div>

      {/* 블로그 목록 영역 */}
      <section aria-label="블로그 글 목록" aria-busy={isSearching} aria-live="polite" className="relative">
        {!isSearching && filteredPosts.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredPosts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}