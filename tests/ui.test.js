import { describe, expect, it, vi, afterEach } from 'vitest';
import { collectInlineHandlerNames, registerInlineHandlers } from '../ui.js';

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

describe('registerInlineHandlers', () => {
  afterEach(() => {
    delete window.toggleEditMode;
    delete window.jumpToNode;
  });

  it('给定含 onclick 的 HTML，handler 表覆盖这些名字，且注册过程不调用 eval', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <button onclick="toggleEditMode()">管理</button>
      <div onclick="jumpToNode(1, 'ws1')">搜索结果</div>
    `;
    const names = collectInlineHandlerNames(root);
    const handlers = {
      toggleEditMode: () => 'edit',
      jumpToNode: () => 'jump',
    };

    expect([...names].every((name) => name in handlers)).toBe(true);

    const evalSpy = vi.spyOn(globalThis, 'eval');
    registerInlineHandlers(handlers, names);
    expect(evalSpy).not.toHaveBeenCalled();
    evalSpy.mockRestore();

    expect(window.toggleEditMode).toBe(handlers.toggleEditMode);
    expect(window.jumpToNode).toBe(handlers.jumpToNode);
  });

  it('表里缺了 HTML 用到的名字时启动会 warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerInlineHandlers({ toggleEditMode() {} }, new Set(['toggleEditMode', 'missingHandler']));
    expect(warnSpy).toHaveBeenCalledWith('未找到界面事件函数: missingHandler');
    warnSpy.mockRestore();
  });
});
