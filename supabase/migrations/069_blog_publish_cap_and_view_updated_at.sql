BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1) 조회수만 바뀐 UPDATE는 updated_at을 건드리지 않는다.
-- increment_blog_view_count가 조회마다 updated_at을 갱신해 sitemap lastModified와
-- JSON-LD dateModified가 "방금 수정됨"으로 왜곡됐다(본문은 그대로인데 신선도 신호만 바뀜).
CREATE OR REPLACE FUNCTION public.update_blog_posts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'view_count' - 'updated_at') = (to_jsonb(OLD) - 'view_count' - 'updated_at') THEN
    NEW.updated_at = OLD.updated_at;
    RETURN NEW;
  END IF;
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

-- 2) 하루 발행 상한을 원자적으로 지킨다.
-- 앱이 "오늘 발행 수"를 센 뒤 저장하면, 로컬 실행과 Actions 실행이 겹칠 때 둘 다 0을 읽고 각각 발행한다.
-- 같은 advisory lock 안에서 세고 발행해 상한을 넘지 않게 한다.
CREATE FUNCTION public.publish_blog_post_within_cap(p_slug TEXT, p_cap INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_day_start TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
  v_count INTEGER;
BEGIN
  IF p_slug IS NULL OR p_slug = '' THEN
    RAISE EXCEPTION 'p_slug is required' USING ERRCODE = '22023';
  END IF;
  IF p_cap IS NULL OR p_cap < 0 OR p_cap > 20 THEN
    RAISE EXCEPTION 'p_cap must be between 0 and 20' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('blog_posts.daily_publish_cap'));

  SELECT status INTO v_status FROM blog_posts WHERE slug = p_slug FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_status = 'published' THEN
    RETURN 'already_published';
  END IF;

  SELECT count(*) INTO v_count
  FROM blog_posts
  WHERE status = 'published' AND published_at >= v_day_start;
  IF v_count >= p_cap THEN
    RETURN 'cap_reached';
  END IF;

  UPDATE blog_posts
  SET status = 'published', published_at = now()
  WHERE slug = p_slug;
  RETURN 'published';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publish_blog_post_within_cap(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_blog_post_within_cap(TEXT, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.publish_blog_post_within_cap(TEXT, INTEGER) IS
  'Publishes a saved blog post only if fewer than p_cap posts were published today (KST); serialized by an advisory lock.';

COMMIT;
