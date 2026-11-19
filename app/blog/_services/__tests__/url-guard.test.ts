import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLookup, mockFetch } = vi.hoisted(() => ({ mockLookup: vi.fn(), mockFetch: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mockLookup }));
vi.mock('undici', () => ({
  Agent: class { close = async () => {}; },
  fetch: mockFetch,
}));

import { assertPublicUrl, isBlockedAddress } from '../url-guard';
import { fetchHtml } from '../http-client';

const html = (body = '<html>ok</html>') => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

beforeEach(() => {
  mockLookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  mockFetch.mockReset();
});

describe('isBlockedAddress', () => {
  it('내부·예약 주소를 막고 공인 주소는 통과시킨다', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
    for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111']) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });
});

describe('assertPublicUrl', () => {
  it('http(s)가 아니거나 내부 호스트·주소면 throw', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(/프로토콜/);
    await expect(assertPublicUrl('http://localhost:3000/')).rejects.toThrow(/내부 호스트/);
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/내부 주소/);
    await expect(assertPublicUrl('http://[::1]/')).rejects.toThrow(/내부 주소/);
    mockLookup.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
    await expect(assertPublicUrl('https://rebind.example.com/')).rejects.toThrow(/내부 주소/);
  });

  it('공인 주소로 풀리는 URL은 통과한다', async () => {
    await expect(assertPublicUrl('https://example.com/a')).resolves.toBeInstanceOf(URL);
  });
});

describe('fetchHtml 리다이렉트', () => {
  it('공인 URL이 내부 주소로 리다이렉트하면 따라가지 않는다', async () => {
    mockFetch.mockResolvedValueOnce(redirect('http://169.254.169.254/latest/meta-data'));
    await expect(fetchHtml('https://example.com/post', 5_000)).rejects.toThrow(/내부 주소/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('공인 주소 사이의 리다이렉트는 따라가 본문을 돌려준다', async () => {
    mockFetch.mockResolvedValueOnce(redirect('/moved')).mockResolvedValueOnce(html());
    await expect(fetchHtml('https://example.com/post', 5_000)).resolves.toBe('<html>ok</html>');
    expect(mockFetch.mock.calls[1][0]).toBe('https://example.com/moved');
    expect(mockFetch.mock.calls.every(([, init]) => init.redirect === 'manual')).toBe(true);
  });
});
