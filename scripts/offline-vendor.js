import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = join(rootDir, 'vendor');

const CDN = {
    fontAwesomeCss: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    cropperCss: 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css',
    sortableJs: 'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js',
    cropperJs: 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js',
    jszipJs: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
};

function vendorPaths() {
    return {
        fontAwesomeCss: join(vendorDir, 'font-awesome', 'css', 'all.min.css'),
        fontAwesomeFontsDir: join(vendorDir, 'font-awesome', 'webfonts'),
        cropperCss: join(vendorDir, 'cropper.min.css'),
        sortableJs: join(vendorDir, 'Sortable.min.js'),
        cropperJs: join(vendorDir, 'cropper.min.js'),
        jszipJs: join(vendorDir, 'jszip.min.js'),
    };
}

function requiredVendorFiles() {
    const paths = vendorPaths();
    return [paths.fontAwesomeCss, paths.cropperCss, paths.sortableJs, paths.cropperJs, paths.jszipJs];
}

function mimeForFont(file) {
    if (file.endsWith('.woff2')) return 'font/woff2';
    if (file.endsWith('.woff')) return 'font/woff';
    if (file.endsWith('.ttf')) return 'font/ttf';
    return 'application/octet-stream';
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

function writeFile(path, contents) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
}

function fontRelativeUrls(css) {
    return [...new Set([...css.matchAll(/url\((['"]?)(\.\.\/webfonts\/[^)'"]+)\1\)/g)].map((match) => match[2]))];
}

function inlineFontAwesomeCss() {
    const paths = vendorPaths();
    if (!existsSync(paths.fontAwesomeCss)) {
        throw new Error('找不到 vendor/font-awesome/css/all.min.css，请先运行 npm run vendor');
    }
    let css = readFileSync(paths.fontAwesomeCss, 'utf8');
    for (const relative of fontRelativeUrls(css)) {
        const file = relative.split('/').pop();
        const fontPath = join(paths.fontAwesomeFontsDir, file);
        if (!existsSync(fontPath)) {
            throw new Error(`找不到 ${fontPath}，请先运行 npm run vendor`);
        }
        const dataUrl = `data:${mimeForFont(file)};base64,${readFileSync(fontPath).toString('base64')}`;
        css = css.replaceAll(`url("${relative}")`, `url("${dataUrl}")`);
        css = css.replaceAll(`url('${relative}')`, `url('${dataUrl}')`);
        css = css.replaceAll(`url(${relative})`, `url(${dataUrl})`);
    }
    return css;
}

function readVendorText(path, label) {
    if (!existsSync(path)) {
        throw new Error(`找不到 ${label}，请先运行 npm run vendor`);
    }
    return readFileSync(path, 'utf8');
}

function loadOfflineVendor() {
    const paths = vendorPaths();
    return {
        css: {
            fontAwesome: inlineFontAwesomeCss(),
            cropper: readVendorText(paths.cropperCss, 'vendor/cropper.min.css'),
        },
        js: {
            sortable: readVendorText(paths.sortableJs, 'vendor/Sortable.min.js'),
            cropper: readVendorText(paths.cropperJs, 'vendor/cropper.min.js'),
            jszip: readVendorText(paths.jszipJs, 'vendor/jszip.min.js'),
        },
    };
}

async function syncOfflineVendor() {
    mkdirSync(vendorDir, { recursive: true });
    const paths = vendorPaths();

    console.log('正在下载离线依赖到 vendor/ ...');
    const css = await fetchText(CDN.fontAwesomeCss);
    writeFile(paths.fontAwesomeCss, css);

    const cssDir = CDN.fontAwesomeCss.replace(/[^/]+$/, '');
    for (const relative of fontRelativeUrls(css)) {
        const file = relative.split('/').pop();
        const buffer = await fetchBuffer(new URL(relative, cssDir).href);
        writeFile(join(paths.fontAwesomeFontsDir, file), buffer);
        console.log(`  vendor/font-awesome/webfonts/${file}`);
    }

    writeFile(paths.cropperCss, await fetchText(CDN.cropperCss));
    writeFile(paths.sortableJs, await fetchText(CDN.sortableJs));
    writeFile(paths.cropperJs, await fetchText(CDN.cropperJs));
    writeFile(paths.jszipJs, await fetchText(CDN.jszipJs));
    console.log('已写入 vendor/，之后打包直接用本地文件。');
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    syncOfflineVendor().catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
}

export { CDN, loadOfflineVendor, requiredVendorFiles, vendorDir, vendorPaths };
