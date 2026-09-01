import { describe, expect, it } from 'vitest';

import * as tagPage from './page';

describe('blog tag hub runtime strategy', () => {
  it('uses six-hour ISR instead of rendering anew for every crawler request', () => {
    expect(tagPage.dynamic).toBe('force-static');
    expect(tagPage.revalidate).toBe(21600);
  });
});
