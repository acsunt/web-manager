$ErrorActionPreference = 'Stop'

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDirectory
$indexFile = Get-ChildItem -LiteralPath $projectRoot -File |
    Where-Object { $_.Name -like '*index.html' } |
    Select-Object -First 1

if (-not $indexFile) {
    throw 'Cannot find index.html.'
}

$stylePath = Join-Path $projectRoot 'style.css'
$scriptPath = Join-Path $projectRoot 'main.js'

if ((Test-Path -LiteralPath $stylePath) -or (Test-Path -LiteralPath $scriptPath)) {
    throw 'style.css or main.js already exists. Split stopped to avoid overwriting files.'
}

$html = [System.IO.File]::ReadAllText($indexFile.FullName)
$stylePattern = '(?s)    <style>\r?\n(.*?)\r?\n    </style>'
$inlineScriptPattern = '(?s)<script(?![^>]*\bsrc=)[^>]*>\r?\n(.*?)\r?\n</script>'
$styleMatch = [System.Text.RegularExpressions.Regex]::Match($html, $stylePattern)
$scriptMatches = [System.Text.RegularExpressions.Regex]::Matches($html, $inlineScriptPattern)

if (-not $styleMatch.Success) { throw 'Cannot find the static inline style block.' }
if ($scriptMatches.Count -ne 1) {
    throw ('Unexpected inline script count: ' + $scriptMatches.Count + '. No files were changed.')
}

$css = [System.Text.RegularExpressions.Regex]::Replace($styleMatch.Groups[1].Value, '(?m)^        ', '')
$javascript = [System.Text.RegularExpressions.Regex]::Replace($scriptMatches[0].Groups[1].Value, '(?m)^    ', '')
$newHtml = $html.Remove($styleMatch.Index, $styleMatch.Length).Insert(
    $styleMatch.Index,
    '    <link rel="stylesheet" href="./style.css">'
)
$remainingScript = [System.Text.RegularExpressions.Regex]::Match($newHtml, $inlineScriptPattern)
if (-not $remainingScript.Success) { throw 'Cannot locate inline script after extracting CSS.' }
$newHtml = $newHtml.Remove($remainingScript.Index, $remainingScript.Length).Insert(
    $remainingScript.Index,
    '<script src="./main.js"></script>'
)

$utf8 = New-Object System.Text.UTF8Encoding($false)
$temporaryStylePath = $stylePath + '.tmp'
$temporaryScriptPath = $scriptPath + '.tmp'
$temporaryHtmlPath = $indexFile.FullName + '.tmp'

try {
    [System.IO.File]::WriteAllText($temporaryStylePath, $css + "`r`n", $utf8)
    [System.IO.File]::WriteAllText($temporaryScriptPath, $javascript + "`r`n", $utf8)
    [System.IO.File]::WriteAllText($temporaryHtmlPath, $newHtml, $utf8)
    $verificationHtml = [System.IO.File]::ReadAllText($temporaryHtmlPath)

    if ($verificationHtml -notmatch '<link rel="stylesheet" href="\./style\.css">') { throw 'style.css reference verification failed.' }
    if ($verificationHtml -notmatch '<script src="\./main\.js"></script>') { throw 'main.js reference verification failed.' }
    if ($verificationHtml -match $stylePattern) { throw 'Static inline style still exists.' }
    if ([System.Text.RegularExpressions.Regex]::Matches($verificationHtml, $inlineScriptPattern).Count -ne 0) { throw 'Inline business script still exists.' }
    if ($verificationHtml -notmatch '<style id="custom-css-style"></style>') { throw 'The custom CSS runtime container is missing.' }

    Move-Item -LiteralPath $temporaryStylePath -Destination $stylePath
    Move-Item -LiteralPath $temporaryScriptPath -Destination $scriptPath
    Move-Item -LiteralPath $temporaryHtmlPath -Destination $indexFile.FullName -Force
}
finally {
    Remove-Item -LiteralPath $temporaryStylePath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $temporaryScriptPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $temporaryHtmlPath -Force -ErrorAction SilentlyContinue
}

Write-Host ('Split completed: ' + $indexFile.Name + ', style.css, main.js')