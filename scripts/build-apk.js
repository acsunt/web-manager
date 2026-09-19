import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { cleanDistArtifacts } from './dist-artifacts.js';
import { uploadDistToRelease } from './upload-apk.js';
import { buildNative } from './build-native.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(rootDir, 'android');
// 本地打包默认输出仓库根目录 dist/，不要改到别的目录。
const distDir = join(rootDir, 'dist');
const assetsDir = join(androidDir, 'app', 'src', 'main', 'assets');
const VERSION_RE = /<title>[^<]*\bv(\d+\.\d+\.\d+)\b/;

function readVersion() {
    const html = readFileSync(join(rootDir, 'index.html'), 'utf8');
    const match = html.match(VERSION_RE);
    if (!match) throw new Error('index.html 的 <title> 缺少 vMAJOR.MINOR.PATCH');
    return match[1];
}

function versionCodeFrom(version) {
    const [major, minor, patch] = version.split('.').map((part) => Number(part));
    return major * 10000 + minor * 100 + patch;
}

function findOfflineHtml(version) {
    const name = `wan-v${version}-no.html`;
    const path = join(distDir, name);
    if (!existsSync(path)) {
        throw new Error(`找不到 ${name}，请先运行 npm run build`);
    }
    return path;
}

function copyHtmlIntoAssets(version) {
    mkdirSync(assetsDir, { recursive: true });
    copyFileSync(findOfflineHtml(version), join(assetsDir, 'index.html'));
    const autofill = join(assetsDir, 'password-autofill.js');
    if (!existsSync(autofill)) {
        throw new Error('找不到 android/app/src/main/assets/password-autofill.js');
    }
}

function gradleCommand() {
    return platform() === 'win32' ? join(androidDir, 'gradlew.bat') : join(androidDir, 'gradlew');
}

// 本机已缓存 gradle-8.14.3-all。android/gradle/wrapper/gradle-wrapper.properties
// 必须指向 gradle-8.14.3-all.zip，不要改成 -bin.zip，否则会再下一份发行包。

function gradleEnv() {
    const env = { ...process.env };
    if (!env.JAVA_HOME && platform() === 'win32') {
        env.JAVA_HOME = 'C:\\Program Files\\Android\\Android Studio\\jbr';
    }
    if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
        env.ANDROID_HOME = platform() === 'win32'
            ? join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Android', 'Sdk')
            : join(process.env.HOME || '', 'Android', 'Sdk');
    }
    return env;
}

function runGradle() {
    return new Promise((resolve, reject) => {
        const child = spawn(gradleCommand(), ['assembleDebug', '--no-daemon'], {
            cwd: androidDir,
            stdio: 'inherit',
            env: gradleEnv(),
            shell: platform() === 'win32',
        });
        child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Gradle 退出码 ${code}`));
        });
    });
}

async function main() {
    await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [join(rootDir, 'scripts', 'build-single-html.js')], {
            cwd: rootDir,
            stdio: 'inherit',
        });
        child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`网页打包失败 ${code}`)));
    });

    const version = readVersion();
    cleanDistArtifacts(distDir, version);
    copyHtmlIntoAssets(version);
    const so32 = join(androidDir, 'app', 'src', 'main', 'jniLibs', 'armeabi-v7a', 'libwebmanager.so');
    const so64 = join(androidDir, 'app', 'src', 'main', 'jniLibs', 'arm64-v8a', 'libwebmanager.so');
    if (!existsSync(so32) || !existsSync(so64)) buildNative();
    console.log(`APK versionName = ${version}（与网页标题一致）`);
    await runGradle();

    const apkPath32 = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-armeabi-v7a-debug.apk');
    const apkPath64 = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-arm64-v8a-debug.apk');
    const namedApk32 = join(distDir, `web-manager-v${version}-32.apk`);
    const namedApk64 = join(distDir, `web-manager-v${version}-64.apk`);
    if (!existsSync(apkPath32) || !existsSync(apkPath64)) {
        throw new Error('Gradle 成功但未找到 32/64 位 app-debug.apk');
    }
    copyFileSync(apkPath32, namedApk32);
    copyFileSync(apkPath64, namedApk64);
    console.log(`已生成：dist/web-manager-v${version}-32.apk`);
    console.log(`已生成：dist/web-manager-v${version}-64.apk`);

    if (process.env.SKIP_UPLOAD === '1') {
        console.log('SKIP_UPLOAD=1，跳过上传 GitHub Release');
        return;
    }
    uploadDistToRelease(version);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
}

export { readVersion, versionCodeFrom };
