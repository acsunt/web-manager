export function replaceOnce(source, search, replacement, label) {
    const index = source.indexOf(search);
    if (index === -1) {
        throw new Error(`打包失败：找不到 ${label}`);
    }
    if (source.indexOf(search, index + search.length) !== -1) {
        throw new Error(`打包失败：${label} 出现多次`);
    }
    // 不能用 String.replace：压缩 JS 里的 $& / $` / $' 会被当成替换符。
    return source.slice(0, index) + replacement + source.slice(index + search.length);
}

export function escapeInlineScript(js) {
    return String(js).replace(/<\/(script)/gi, '<\\/$1');
}
