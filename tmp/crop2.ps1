param([string]$In, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$Scale = 3, [string]$Out)
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile($In)
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($src, (New-Object System.Drawing.Rectangle(0,0,$W,$H)), (New-Object System.Drawing.Rectangle($X,$Y,$W,$H)), [System.Drawing.GraphicsUnit]::Pixel)
$big = New-Object System.Drawing.Bitmap(($W*$Scale), ($H*$Scale))
$g2 = [System.Drawing.Graphics]::FromImage($big)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g2.DrawImage($bmp, 0, 0, ($W*$Scale), ($H*$Scale))
$big.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $g2.Dispose(); $bmp.Dispose(); $big.Dispose(); $src.Dispose()
Write-Output "cropped=$Out"
