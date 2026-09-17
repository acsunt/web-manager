import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { escapeInlineScript, replaceOnce } from './html-inline.js';
import { cleanDistArtifacts } from './dist-artifacts.js';
import { CDN, loadOfflineVendor } from './offline-vendor.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
// 本地打包默认输出仓库根目录 dist/，不要改到别的目录。
const distDir = join(rootDir, 'dist');
const indexPath = join(rootDir, 'index.html');
const stylePath = join(rootDir, 'style.css');
const mainPath = join(rootDir, 'main.js');

const VERSION_RE = /<title>[^<]*\bv(\d+\.\d+\.\d+)\b/;

function readVersion(html) {
    const match = html.match(VERSION_RE);
    if (!match) {
        throw new Error('index.html 的 <title> 缺少 vMAJOR.MINOR.PATCH');
    }
    return match[1];
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
}

function outputName(kind, version) {
    return kind === 'online'
        ? `wan-v${version}-yes.html`
        : `wan-v${version}-no.html`;
}

async function bundleAppJs() {
    const result = await esbuild.build({
        absWorkingDir: rootDir,
        entryPoints: [mainPath],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: ['es2017'],
        minify: true,
        write: false,
        logLevel: 'silent',
    });
    return result.outputFiles[0].text;
}

async function buildHtml({ offline, html, css, appJs, vendorCss, vendorJs }) {
    let out = html;

    const localCssTag = '    <link rel="stylesheet" href="./style.css">';
    const moduleTag = '<script type="module" src="./main.js"></script>';
    const faTag = `    <link rel="stylesheet" href="${CDN.fontAwesomeCss}">`;
    const cropperCssTag = `    <link rel="stylesheet" href="${CDN.cropperCss}">`;
    const sortableTag = `    <script src="${CDN.sortableJs}"></script>`;
    const cropperJsTag = `    <script src="${CDN.cropperJs}"></script>`;
    const jszipTag = `    <script src="${CDN.jszipJs}"></script>`;

    out = replaceOnce(out, localCssTag, `    <style>\n${css}\n    </style>`, 'style.css 引用');
    out = replaceOnce(out, moduleTag, `<script>\n${escapeInlineScript(appJs)}\n</script>`, 'main.js 模块引用');

    if (offline) {
        out = replaceOnce(out, faTag, `    <style>\n${vendorCss.fontAwesome}\n    </style>`, 'Font Awesome CSS');
        out = replaceOnce(out, cropperCssTag, `    <style>\n${vendorCss.cropper}\n    </style>`, 'Cropper CSS');
        out = replaceOnce(out, sortableTag, `    <script>\n${escapeInlineScript(vendorJs.sortable)}\n    </script>`, 'Sortable JS');
        out = replaceOnce(out, cropperJsTag, `    <script>\n${escapeInlineScript(vendorJs.cropper)}\n    </script>`, 'Cropper JS');
        out = replaceOnce(out, jszipTag, `    <script>\n${escapeInlineScript(vendorJs.jszip)}\n    </script>`, 'JSZip JS');
    }

    return out;
}

function printSizes(files) {
    const rows = files.map(({ name, bytes }) => ({
        name,
        size: formatSize(bytes),
        bytes,
    }));
    const nameWidth = Math.max(...rows.map((row) => row.name.length));
    console.log('');
    console.log('单文件体积');
    for (const row of rows) {
        console.log(`  ${row.name.padEnd(nameWidth)}  ${row.size}`);
    }
    console.log('');
}

async function main() {
    mkdirSync(distDir, { recursive: true });

    const html = readFileSync(indexPath, 'utf8');
    const version = readVersion(html);
    cleanDistArtifacts(distDir, version);
    const css = readFileSync(stylePath, 'utf8');
    const appJs = await bundleAppJs();

    console.log(`正在打包单文件 v${version} ...`);

    const onlineName = outputName('online', version);
    const onlineHtml = await buildHtml({
        offline: false,
        html,
        css,
        appJs,
        vendorCss: {},
        vendorJs: {},
    });
    assertSingleHtml(onlineHtml, { offline: false });
    const onlinePath = join(distDir, onlineName);
    writeFileSync(onlinePath, onlineHtml, 'utf8');

    if (process.env.SKIP_OFFLINE === '1') {
        printSizes([{ name: onlineName, bytes: Buffer.byteLength(onlineHtml) }]);
        console.log(`已生成：`);
        console.log(`  dist/${onlineName}`);
        return;
    }

    console.log('正在读取本地离线依赖 vendor/（Font Awesome / Cropper / Sortable / JSZip）...');
    const vendor = loadOfflineVendor();
    const vendorCss = vendor.css;
    const vendorJs = vendor.js;

    const offlineName = outputName('offline', version);
    const offlineHtml = await buildHtml({
        offline: true,
        html,
        css,
        appJs,
        vendorCss,
        vendorJs,
    });
    assertSingleHtml(offlineHtml, { offline: true });
    const offlinePath = join(distDir, offlineName);
    writeFileSync(offlinePath, offlineHtml, 'utf8');

    printSizes([
        { name: onlineName, bytes: Buffer.byteLength(onlineHtml) },
        { name: offlineName, bytes: Buffer.byteLength(offlineHtml) },
    ]);

    console.log(`已生成：`);
    console.log(`  dist/${onlineName}`);
    console.log(`  dist/${offlineName}`);
}

function assertSingleHtml(html, { offline }) {
    if (html.includes('src="./main.js"') || html.includes('href="./style.css"')) {
        throw new Error('打包失败：单文件仍引用本地 main.js / style.css');
    }
    const scriptOpens = html.split('<script').length - 1;
    const scriptCloses = html.split('</script>').length - 1;
    if (scriptOpens !== scriptCloses) {
        throw new Error(`打包失败：script 标签不成对 (${scriptOpens} / ${scriptCloses})`);
    }
    if (offline && html.includes('cdnjs.cloudflare.com')) {
        throw new Error('打包失败：离线文件仍引用 CDN');
    }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
}
