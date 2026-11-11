const { sanitizeContent } = require('../../src/utils/sanitize');

describe('sanitizeContent (SEC-003, TC-09)', () => {
  test('escapes HTML so a script payload can never become markup', () => {
    expect(sanitizeContent('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  test('escapes attribute-breaking quotes and ampersands', () => {
    expect(sanitizeContent(`<img src=x onerror='a&b'>`)).toBe('&lt;img src=x onerror=&#39;a&amp;b&#39;&gt;');
  });

  test('strips control characters but keeps newlines and tabs', () => {
    expect(sanitizeContent('a\u0000b\u0007c\nd\te\u007F')).toBe('abc\nd\te');
  });

  test('leaves ordinary text alone apart from trimming', () => {
    expect(sanitizeContent('  hello, world! 👋  ')).toBe('hello, world! 👋');
  });
});
