import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanDistArtifacts, currentArtifactNames, isManagedArtifact } from '../scripts/dist-artifacts.js';

const tmpDir = join(tmpdir(), 'web-manager-dist-clean');

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('dist 产物', () => {
  it('当前版本只保留两份 HTML 和 32/64 位 APK', () => {
    expect(currentArtifactNames('13.0.13')).toEqual([
      'wan-v13.0.13-yes.html',
      'wan-v13.0.13-no.html',
      'web-manager-v13.0.13-32.apk',
      'web-manager-v13.0.13-64.apk',
    ]);
  });

  it('识别托管产物文件名', () => {
    expect(isManagedArtifact('wan-v13.0.12-yes.html')).toBe(true);
    expect(isManagedArtifact('web-manager-v13.0.12.apk')).toBe(true);
    expect(isManagedArtifact('web-manager-v13.0.12-32.apk')).toBe(true);
    expect(isManagedArtifact('web-manager-v13.0.12-64.apk')).toBe(true);
    expect(isManagedArtifact('release-notes.md')).toBe(false);
  });

  it('打包时删除旧版本，保留当前版本和无关文件', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'wan-v13.0.12-yes.html'), 'old');
    writeFileSync(join(tmpDir, 'wan-v13.0.12-no.html'), 'old');
    writeFileSync(join(tmpDir, 'web-manager-v13.0.12.apk'), 'old');
    writeFileSync(join(tmpDir, 'web-manager-v13.0.12-32.apk'), 'old');
    writeFileSync(join(tmpDir, 'web-manager-v13.0.13-yes.html'), 'keep');
    writeFileSync(join(tmpDir, 'notes.txt'), 'keep');

    const removed = cleanDistArtifacts(tmpDir, '13.0.13');
    expect(removed.sort()).toEqual([
      'wan-v13.0.12-no.html',
      'wan-v13.0.12-yes.html',
      'web-manager-v13.0.12-32.apk',
      'web-manager-v13.0.12.apk',
    ]);
    expect(isManagedArtifact('wan-v13.0.13-yes.html')).toBe(true);
  });
});
