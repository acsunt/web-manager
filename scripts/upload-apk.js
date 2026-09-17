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

function uploadApkToRelease(version = readVersion()) {
    const apkName = `web-manager-v${version}.apk`;
    const apkPath = join(distDir, apkName);
    const tag = `v${version}`;
    if (!existsSync(apkPath)) {
        throw new Error(`找不到 ${apkName}，请先完成本地 APK 打包`);
    }

    const view = runGh(['release', 'view', tag], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (view.error?.code === 'ENOENT') {
        throw new Error('找不到 gh 命令。请先安装 GitHub CLI 并 gh auth login。');
    }
    if (view.status !== 0) {
        throw new Error(`找不到 GitHub Release ${tag}。请先推送到 main，等网页 HTML Release 建好后再上传 APK。`);
    }

    const upload = runGh(['release', 'upload', tag, apkPath, '--clobber'], { stdio: 'inherit' });
    if (upload.status !== 0) {
        throw new Error(`上传 ${apkName} 到 Release ${tag} 失败`);
    }
    console.log(`已上传到 Release ${tag}：${apkName}`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    try {
        uploadApkToRelease();
    } catch (error) {
        console.error(error.message || error);
        process.exit(1);
    }
}

export { uploadApkToRelease };
