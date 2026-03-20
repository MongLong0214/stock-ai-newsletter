import { describe, expect, it } from 'vitest';

import * as tagPage from './page';

describe('blog tag hub runtime strategy', () => {
  it('forces dynamic rendering so live tag pages do not depend on build-time prerender state', () => {
    expect(tagPage.dynamic).toBe('force-dynamic');
  });
});
