import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(rootDir, 'dist');
const indexPath = join(rootDir, 'index.html');
const stylePath = join(rootDir, 'style.css');
const mainPath = join(rootDir, 'main.js');

const CDN = {
    fontAwesomeCss: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    cropperCss: 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css',
    sortableJs: 'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js',
    cropperJs: 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js',
    jszipJs: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
};

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

async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`下载失败 ${response.status} ${url}`);
    }
    return response.text();
}

async function fetchBuffer(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`下载失败 ${response.status} ${url}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

function mimeForFont(file) {
    if (file.endsWith('.woff2')) return 'font/woff2';
    if (file.endsWith('.woff')) return 'font/woff';
    if (file.endsWith('.ttf')) return 'font/ttf';
    return 'application/octet-stream';
}

async function inlineFontAwesomeCss() {
    const cssUrl = CDN.fontAwesomeCss;
    const cssDir = cssUrl.replace(/[^/]+$/, '');
    let css = await fetchText(cssUrl);
    const fontUrls = [...new Set([...css.matchAll(/url\((['"]?)(\.\.\/webfonts\/[^)'"]+)\1\)/g)].map((match) => match[2]))];

    for (const relative of fontUrls) {
        const absolute = new URL(relative, cssDir).href;
        const file = relative.split('/').pop();
        const buffer = await fetchBuffer(absolute);
        const dataUrl = `data:${mimeForFont(file)};base64,${buffer.toString('base64')}`;
        css = css.replaceAll(`url("${relative}")`, `url("${dataUrl}")`);
        css = css.replaceAll(`url('${relative}')`, `url('${dataUrl}')`);
        css = css.replaceAll(`url(${relative})`, `url(${dataUrl})`);
    }

    return css;
}

async function bundleAppJs() {
    const result = await esbuild.build({
        absWorkingDir: rootDir,
        entryPoints: [mainPath],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: ['es2020'],
        minify: true,
        write: false,
        logLevel: 'silent',
    });
    return result.outputFiles[0].text;
}

function replaceOnce(source, search, replacement, label) {
    if (!source.includes(search)) {
        throw new Error(`打包失败：找不到 ${label}`);
    }
    return source.replace(search, replacement);
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
    out = replaceOnce(out, moduleTag, `<script>\n${appJs}\n</script>`, 'main.js 模块引用');

    if (offline) {
        out = replaceOnce(out, faTag, `    <style>\n${vendorCss.fontAwesome}\n    </style>`, 'Font Awesome CSS');
        out = replaceOnce(out, cropperCssTag, `    <style>\n${vendorCss.cropper}\n    </style>`, 'Cropper CSS');
        out = replaceOnce(out, sortableTag, `    <script>\n${vendorJs.sortable}\n    </script>`, 'Sortable JS');
        out = replaceOnce(out, cropperJsTag, `    <script>\n${vendorJs.cropper}\n    </script>`, 'Cropper JS');
        out = replaceOnce(out, jszipTag, `    <script>\n${vendorJs.jszip}\n    </script>`, 'JSZip JS');
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
    const onlinePath = join(distDir, onlineName);
    writeFileSync(onlinePath, onlineHtml, 'utf8');

    console.log('正在下载离线依赖（Font Awesome / Cropper / Sortable / JSZip）...');
    const vendorCss = {
        fontAwesome: await inlineFontAwesomeCss(),
        cropper: await fetchText(CDN.cropperCss),
    };
    const vendorJs = {
        sortable: await fetchText(CDN.sortableJs),
        cropper: await fetchText(CDN.cropperJs),
        jszip: await fetchText(CDN.jszipJs),
    };

    const offlineName = outputName('offline', version);
    const offlineHtml = await buildHtml({
        offline: true,
        html,
        css,
        appJs,
        vendorCss,
        vendorJs,
    });
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

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
