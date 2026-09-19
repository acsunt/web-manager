import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readVersion } from './build-apk.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(rootDir, 'dist');

function runGh(args, options = {}) {
    return spawnSync('gh', args, {
        cwd: rootDir,
        encoding: 'utf8',
        shell: process.platform === 'win32',
        ...options,
    });
}

function distArtifacts(version) {
    return [
        `wan-v${version}-yes.html`,
        `wan-v${version}-no.html`,
        `web-manager-v${version}-32.apk`,
        `web-manager-v${version}-64.apk`,
    ].map((name) => ({ name, path: join(distDir, name) }));
}

function writeReleaseNotes(version) {
    const notesPath = join(distDir, 'release-notes.md');
    const result = spawnSync(process.execPath, [join(rootDir, 'scripts', 'release-notes.mjs'), '--github'], {
        cwd: rootDir,
        encoding: 'utf8',
        env: {
            ...process.env,
            ONLINE: `wan-v${version}-yes.html`,
            OFFLINE: `wan-v${version}-no.html`,
            APK32: `web-manager-v${version}-32.apk`,
            APK64: `web-manager-v${version}-64.apk`,
            NOTES_FILE: notesPath,
        },
    });
    if (result.status !== 0) {
        throw new Error(result.stderr?.trim() || result.stdout?.trim() || '生成 Release 说明失败');
    }
    return notesPath;
}

function uploadDistToRelease(version = readVersion()) {
    const files = distArtifacts(version);
    const missing = files.filter((file) => !existsSync(file.path)).map((file) => file.name);
    if (missing.length) {
        throw new Error(`找不到 ${missing.join('、')}，请先完成本地 npm run apk`);
    }

    const tag = `v${version}`;
    const notesPath = writeReleaseNotes(version);
    const paths = files.map((file) => file.path);

    const view = runGh(['release', 'view', tag], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (view.error?.code === 'ENOENT') {
        throw new Error('找不到 gh 命令。请先安装 GitHub CLI 并 gh auth login。');
    }

    if (view.status !== 0) {
        const create = runGh(
            ['release', 'create', tag, ...paths, '--title', tag, '--notes-file', notesPath],
            { stdio: 'inherit' },
        );
        if (create.status !== 0) {
            throw new Error(`创建 GitHub Release ${tag} 失败。请先推送到 main 再上传。`);
        }
    } else {
        const edit = runGh(['release', 'edit', tag, '--notes-file', notesPath], { stdio: 'inherit' });
        if (edit.status !== 0) {
            throw new Error(`更新 GitHub Release ${tag} 说明失败`);
        }
        const upload = runGh(['release', 'upload', tag, ...paths, '--clobber'], { stdio: 'inherit' });
        if (upload.status !== 0) {
            throw new Error(`上传产物到 Release ${tag} 失败`);
        }
    }

    console.log(`已上传到 Release ${tag}：${files.map((file) => file.name).join('、')}`);
}

const uploadApkToRelease = uploadDistToRelease;

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    try {
        uploadDistToRelease();
    } catch (error) {
        console.error(error.message || error);
        process.exit(1);
    }
}

export { uploadDistToRelease, uploadApkToRelease };
