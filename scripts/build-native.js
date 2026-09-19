import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { homedir, platform } from 'node:os';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(rootDir, 'android', 'app', 'src', 'main', 'cpp', 'native-lib.c');
const jniLibs = join(rootDir, 'android', 'app', 'src', 'main', 'jniLibs');

function sdkRoot() {
    return process.env.ANDROID_HOME
        || process.env.ANDROID_SDK_ROOT
        || (platform() === 'win32'
            ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Android', 'Sdk')
            : join(homedir(), 'Android', 'Sdk'));
}

function ndkRoot() {
    const sdk = sdkRoot();
    const pinned = join(sdk, 'ndk', '29.0.14206865');
    if (existsSync(pinned)) return pinned;
    const ndkDir = join(sdk, 'ndk');
    return existsSync(ndkDir) ? ndkDir : '';
}

function clangBin(ndk, triple) {
    const host = platform() === 'win32' ? 'windows-x86_64' : 'linux-x86_64';
    const dir = join(ndk, 'toolchains', 'llvm', 'prebuilt', host, 'bin');
    const base = join(dir, `${triple}24-clang`);
    const cmd = `${base}.cmd`;
    if (existsSync(cmd)) return cmd;
    if (existsSync(base)) return base;
    return '';
}

function compile(clang, out) {
    mkdirSync(dirname(out), { recursive: true });
    const result = spawnSync(clang, ['-shared', '-fPIC', '-O2', '-o', out, src], {
        stdio: 'inherit',
        shell: platform() === 'win32',
    });
    if (result.status !== 0) throw new Error(`编译 ${out} 失败`);
}

function main() {
    if (!existsSync(src)) throw new Error('找不到 native-lib.c');
    const ndk = ndkRoot();
    if (!ndk) throw new Error('找不到 Android NDK，无法编译 32/64 位 .so');
    const clang32 = clangBin(ndk, 'armv7a-linux-androideabi');
    const clang64 = clangBin(ndk, 'aarch64-linux-android');
    if (!clang32 || !clang64) throw new Error('NDK 缺少 armeabi-v7a / arm64-v8a clang');
    compile(clang32, join(jniLibs, 'armeabi-v7a', 'libwebmanager.so'));
    compile(clang64, join(jniLibs, 'arm64-v8a', 'libwebmanager.so'));
    console.log('已生成 32/64 位 libwebmanager.so');
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

export { main as buildNative };
