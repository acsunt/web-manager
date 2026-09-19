import { describe, expect, it } from 'vitest';
import {
  applyCredentialEdit,
  credentialsEqual,
  matchCredentials,
  normalizeWebsite,
  originsMatch,
  parseCredentials,
  removeCredentials,
  snapshotCredential,
  upsertCapturedLogin,
} from '../password-store.js';

describe('normalizeWebsite', () => {
  it('从完整网址取出主机名', () => {
    expect(normalizeWebsite('https://www.Example.com/login?x=1')).toBe('www.example.com');
  });

  it('没有协议时也能解析', () => {
    expect(normalizeWebsite('example.com/path')).toBe('example.com');
  });

  it('空值返回空字符串', () => {
    expect(normalizeWebsite('')).toBe('');
    expect(normalizeWebsite('   ')).toBe('');
  });
});

describe('originsMatch', () => {
  it('忽略 www 和路径', () => {
    expect(originsMatch('example.com', 'https://www.example.com/login')).toBe(true);
  });

  it('不同站点不匹配', () => {
    expect(originsMatch('a.com', 'https://b.com')).toBe(false);
  });
});

describe('parseCredentials', () => {
  it('坏 JSON 返回空数组', () => {
    expect(parseCredentials('{')).toEqual([]);
    expect(parseCredentials(null)).toEqual([]);
  });

  it('兼容 account 字段并补 id', () => {
    const list = parseCredentials([{ website: 'a.com', account: 'u1', password: 'p1' }]);
    expect(list).toHaveLength(1);
    expect(list[0].username).toBe('u1');
    expect(list[0].id).toMatch(/^p_/);
  });
});

describe('matchCredentials', () => {
  const list = [
    { id: '1', website: 'example.com', username: 'alice', password: 'a' },
    { id: '2', website: 'example.com', username: 'bob', password: 'b' },
    { id: '3', website: 'other.com', username: 'alice', password: 'c' },
  ];

  it('只返回当前网站的账号', () => {
    expect(matchCredentials(list, 'https://www.example.com').map((item) => item.username)).toEqual(['alice', 'bob']);
  });

  it('输入时按账号过滤', () => {
    expect(matchCredentials(list, 'https://example.com', 'bo').map((item) => item.username)).toEqual(['bob']);
  });
});

describe('upsertCapturedLogin', () => {
  it('同网站同账号更新密码', () => {
    const first = upsertCapturedLogin([], { url: 'https://a.com/login', username: 'u', password: 'old', title: '登录' });
    const second = upsertCapturedLogin(first, { url: 'https://a.com/', username: 'u', password: 'new' });
    expect(second).toHaveLength(1);
    expect(second[0].password).toBe('new');
    expect(second[0].title).toBe('登录');
  });

  it('同网站不同账号各存一条', () => {
    const first = upsertCapturedLogin([], { url: 'https://a.com', username: 'u1', password: 'p1' });
    const second = upsertCapturedLogin(first, { url: 'https://a.com', username: 'u2', password: 'p2' });
    expect(second).toHaveLength(2);
  });

  it('缺账号或密码不保存', () => {
    expect(upsertCapturedLogin([], { url: 'https://a.com', username: '', password: 'p' })).toEqual([]);
    expect(upsertCapturedLogin([], { url: 'https://a.com', username: 'u', password: '' })).toEqual([]);
  });
});

describe('removeCredentials', () => {
  it('按 id 删除一条或多条', () => {
    const list = [
      { id: '1', website: 'a.com', username: 'u1', password: 'p1' },
      { id: '2', website: 'b.com', username: 'u2', password: 'p2' },
      { id: '3', website: 'c.com', username: 'u3', password: 'p3' },
    ];
    expect(removeCredentials(list, '2').map((item) => item.id)).toEqual(['1', '3']);
    expect(removeCredentials(list, ['1', '3']).map((item) => item.id)).toEqual(['2']);
    expect(removeCredentials(list, [])).toHaveLength(3);
  });
});

describe('applyCredentialEdit', () => {
  it('保存后三个字段都改掉', () => {
    const list = [{ id: '1', website: 'old.com', username: 'old', password: 'old' }];
    const next = applyCredentialEdit(list, '1', { website: 'new.com', username: 'neo', password: 'secret' });
    expect(next[0]).toEqual(expect.objectContaining({
      website: 'new.com',
      username: 'neo',
      password: 'secret',
    }));
  });

  it('保存时可以改打开网页时的标题', () => {
    const list = [{ id: '1', website: 'old.com', title: '旧标题', username: 'old', password: 'old' }];
    const next = applyCredentialEdit(list, '1', { website: 'old.com', title: '新标题', username: 'old', password: 'old' });
    expect(next[0].title).toBe('新标题');
  });

  it('网站或账号为空时不改', () => {
    const list = [{ id: '1', website: 'old.com', username: 'old', password: 'old' }];
    expect(applyCredentialEdit(list, '1', { website: '', username: 'neo', password: 'x' })[0].website).toBe('old.com');
  });
});

describe('draft cancel', () => {
  it('取消时用快照恢复，不沿用输入框里的值', () => {
    const original = snapshotCredential({ id: '1', website: 'a.com', title: '站点', username: 'u', password: 'p' });
    const draft = { id: '1', website: 'b.com', title: '站点', username: 'x', password: 'y' };
    expect(credentialsEqual(original, draft)).toBe(false);
    expect(snapshotCredential(original)).toEqual({ id: '1', website: 'a.com', title: '站点', username: 'u', password: 'p' });
  });
});
