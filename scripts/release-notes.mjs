import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SECTIONS = ['新增', '优化', '修复'];
const HEADING_RE = /^(新增|优化|修复)\s*[:：]?\s*(.*)$/;

function stripBullet(text) {
    return text.replace(/^[-*]\s+/, '').trim();
}

function parseReleaseNotes(text) {
    const buckets = { 新增: [], 优化: [], 修复: [] };
    let current = null;

    for (const raw of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
        const line = raw.trim();
        if (!line) continue;

        const heading = line.match(HEADING_RE);
        if (heading) {
            current = heading[1];
            const rest = stripBullet(heading[2]);
            if (rest) buckets[current].push(rest);
            continue;
        }

        if (current && /^[-*]\s+\S/.test(line)) {
            buckets[current].push(stripBullet(line));
        }
    }

    return buckets;
}

function formatReleaseNotes(buckets) {
    const parts = [];
    for (const key of SECTIONS) {
        if (!buckets[key].length) continue;
        parts.push(`## ${key}`, '', ...buckets[key].map((item) => `- ${item}`), '');
    }
    return parts.join('\n').trim();
}

function formatDownloadNotes({ online, offline, apk, apk32, apk64 }) {
    const lines = ['## 下载', ''];
    if (online) lines.push(`- ${online}：需联网加载 Font Awesome / Cropper / Sortable / JSZip`);
    if (offline) lines.push(`- ${offline}：依赖已内联，可离线双击打开`);
    if (apk32) lines.push(`- ${apk32}：Android 32 位安装包（armeabi-v7a），内置离线网页`);
    if (apk64) lines.push(`- ${apk64}：Android 64 位安装包（arm64-v8a），内置离线网页`);
    if (apk) lines.push(`- ${apk}：Android 安装包，内置离线网页`);
    return lines.join('\n');
}

function formatGithubReleaseBody(text, files = {}) {
    const changelog = formatReleaseNotes(validateReleaseNotes(text));
    const downloads = formatDownloadNotes(files);
    return downloads ? `${changelog}\n\n${downloads}` : changelog;
}

function validateReleaseNotes(text) {
    const buckets = parseReleaseNotes(text);
    const total = SECTIONS.reduce((sum, key) => sum + buckets[key].length, 0);
    if (!total) {
        throw new Error('提交说明缺少「新增 / 优化 / 修复」段落，GitHub Release 无法写明这次改了什么。');
    }
    return buckets;
}

function git(command) {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function tryGit(command) {
    try {
        return git(command);
    } catch {
        return '';
    }
}

function previousVersionTag(version) {
    const parts = String(version || '').split('.').map((part) => Number(part));
    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) return '';
    const [major, minor, patch] = parts;
    if (patch > 0) return `v${major}.${minor}.${patch - 1}`;
    return '';
}

function readTitleVersion() {
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
    const match = html.match(/<title>[^<]*\bv(\d+\.\d+\.\d+)\b/);
    return match ? match[1] : '';
}

function ensureTag(tag) {
    if (!tag) return false;
    if (tryGit(`git rev-parse --verify ${tag}^{commit}`)) return true;
    try {
        execSync(`git fetch origin tag ${tag} --no-tags`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    } catch {
        return false;
    }
    return Boolean(tryGit(`git rev-parse --verify ${tag}^{commit}`));
}

function collectCommitText(mode) {
    if (mode === 'github') {
        const prevTag = previousVersionTag(readTitleVersion());
        if (ensureTag(prevTag)) {
            const text = tryGit(`git log ${prevTag}..HEAD --format=%B`);
            if (text) return text;
        }
        return git('git log -1 --format=%B');
    }

    try {
        git('git rev-parse --verify origin/main');
        const pending = git('git log origin/main..HEAD --format=%B');
        return pending || git('git log -1 --format=%B');
    } catch {
        return git('git log -1 --format=%B');
    }
}

function main() {
    const mode = process.argv.includes('--github') ? 'github' : 'check';
    const text = collectCommitText(mode);
    const buckets = validateReleaseNotes(text);
    const notes = formatReleaseNotes(buckets);

    if (mode === 'check') {
        console.log('');
        console.log('========================================');
        console.log('  推送前 Release 说明');
        console.log('========================================');
        console.log(notes);
        console.log('');
        return;
    }

    const body = formatGithubReleaseBody(text, {
        online: process.env.ONLINE,
        offline: process.env.OFFLINE,
        apk: process.env.APK,
        apk32: process.env.APK32,
        apk64: process.env.APK64,
    });
    const outFile = process.env.NOTES_FILE;
    if (outFile) {
        writeFileSync(outFile, `${body}\n`, 'utf8');
        return;
    }
    process.stdout.write(body);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    try {
        main();
    } catch (error) {
        console.error(error.message || error);
        process.exit(1);
    }
}

export { parseReleaseNotes, formatReleaseNotes, formatGithubReleaseBody, previousVersionTag, validateReleaseNotes };
