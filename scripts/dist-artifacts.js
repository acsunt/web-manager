import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

function currentArtifactNames(version) {
    return [
        `wan-v${version}-yes.html`,
        `wan-v${version}-no.html`,
        `web-manager-v${version}.apk`,
    ];
}

function isManagedArtifact(name) {
    return /^(wan-v\d+\.\d+\.\d+-(?:yes|no)\.html|web-manager-v\d+\.\d+\.\d+\.apk)$/.test(name);
}

function cleanDistArtifacts(distDir, version) {
    mkdirSync(distDir, { recursive: true });
    const keep = new Set(currentArtifactNames(version));
    const removed = [];
    for (const name of readdirSync(distDir)) {
        if (!isManagedArtifact(name) || keep.has(name)) continue;
        rmSync(join(distDir, name), { force: true });
        removed.push(name);
        console.log(`已删除旧产物：dist/${name}`);
    }
    return removed;
}

export { currentArtifactNames, isManagedArtifact, cleanDistArtifacts };
