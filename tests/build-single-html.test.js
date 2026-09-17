import { describe, expect, it } from 'vitest';
import { replaceOnce } from '../scripts/html-inline.js';

describe('replaceOnce', () => {
  it('按字面量替换，不把 $& 当成 replace 特殊符', () => {
    const source = 'BEFORE<script type="module" src="./main.js"></script>AFTER';
    const search = '<script type="module" src="./main.js"></script>';
    const replacement = '<script>\nA&&(B=1);$&&($.x=1);\n</script>';
    const out = replaceOnce(source, search, replacement, 'main.js 模块引用');
    expect(out).toBe('BEFORE<script>\nA&&(B=1);$&&($.x=1);\n</script>AFTER');
    expect(out).not.toContain('src="./main.js"');
  });

  it('找不到目标时抛错', () => {
    expect(() => replaceOnce('abc', 'zzz', 'n', '标签')).toThrow('找不到 标签');
  });
});
