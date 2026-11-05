# Renders the 1024px source icon (app-icon.png). Run once, then:
#   npx tauri icon app-icon.png
Add-Type -AssemblyName System.Drawing
$size = 1024
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# background tile
$bg = RoundRect 48 48 928 928 220
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 1024, 1024), ([System.Drawing.Color]::FromArgb(255, 124, 104, 238)), ([System.Drawing.Color]::FromArgb(255, 92, 72, 214))
$g.FillPath($grad, $bg)

# three tabs fanned on the right edge (the deck)
$tabs = @(
  @{ c = [System.Drawing.Color]::FromArgb(255, 191, 219, 247); y = 250 },
  @{ c = [System.Drawing.Color]::FromArgb(255, 189, 232, 210); y = 420 },
  @{ c = [System.Drawing.Color]::FromArgb(255, 250, 211, 168); y = 590 }
)
foreach ($t in $tabs) {
  $p = RoundRect 700 $t.y 190 150 48
  $g.FillPath((New-Object System.Drawing.SolidBrush $t.c), $p)
}

# main note
$shadow = RoundRect 214 254 460 520 60
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 20, 10, 60))), $shadow)
$note = RoundRect 196 230 460 520 60
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 252, 228, 140))), $note)
$ink = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 120, 92, 40)), 34
$ink.StartCap = 'Round'; $ink.EndCap = 'Round'
$g.DrawLine($ink, 270, 360, 560, 360)
$g.DrawLine($ink, 270, 460, 520, 460)
$g.DrawLine($ink, 270, 560, 470, 560)

$out = Join-Path $PSScriptRoot '..\app-icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "wrote $out"
