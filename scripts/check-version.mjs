import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const VERSION_RE = /<title>[^<]*\bv(\d+\.\d+\.\d+)\b/;

function readVersion(html, label) {
    const match = html.match(VERSION_RE);
    if (!match) {
        console.error(`${label} 的 <title> 缺少 vMAJOR.MINOR.PATCH，例如 v13.0.1`);
        process.exit(1);
    }
    return match[1];
}

const current = readVersion(readFileSync('index.html', 'utf8'), 'index.html');

console.log('');
console.log('========================================');
console.log(`  推送前版本号: v${current}`);
console.log('  规则: 每次更新 PATCH +1（13.0.1 → 13.0.2）');
console.log('========================================');
console.log('');

let remoteHtml = '';
try {
    remoteHtml = execSync('git show origin/main:index.html', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch {
    process.exit(0);
}

const remoteMatch = remoteHtml.match(VERSION_RE) || remoteHtml.match(/<title>[^<]*\bv(\d+\.\d+)\b/);
if (!remoteMatch) process.exit(0);

const remote = remoteMatch[1];
if (remote === current) {
    console.error(`版本号仍是 v${current}，推送前请把 index.html 标题递增（例如 v13.0.1 → v13.0.2）。`);
    process.exit(1);
}
