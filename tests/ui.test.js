import { describe, expect, it } from 'vitest';
import { collectInlineHandlerNames } from '../ui.js';

describe('collectInlineHandlerNames', () => {
  it('能从一段 HTML 抽出 onclick 函数名', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <button onclick="toggleEditMode()">管理</button>
      <input onchange="doSomething(1)">
      <div oninput="notACall">忽略</div>
    `;

    const names = collectInlineHandlerNames(root);
    expect(names.has('toggleEditMode')).toBe(true);
    expect(names.has('doSomething')).toBe(true);
    expect(names.has('notACall')).toBe(false);
  });
});
