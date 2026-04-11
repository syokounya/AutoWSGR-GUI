$utf8 = New-Object System.Text.UTF8Encoding($false)
function Get-Indent([string]$s){ $s.Length - $s.TrimStart(' ').Length }
function Is-PureString([string[]]$b){
 if($b.Count -ne 1){return $false}
 if($b[0] -notmatch '^(\s*)-\s*(.*)$'){return $false}
 $r=$matches[2].Trim(); if(!$r -or $r.StartsWith('#')){return $false}
 if($r -match '^\{.*\}$' -or $r -match '^\[.*\]$' -or $r -match '^[^#]+:\s*'){return $false}
 return $true
}
function Split-ItemBlocks([string[]]$lines,[int]$start,[int]$shipsIndent){
 $line=$lines[$start]
 $line -match '^(\s*)-\s*(.*)$' | Out-Null
 $itemIndent=$matches[1].Length
 $block=New-Object System.Collections.Generic.List[string]; $block.Add($line)
 $j=$start+1
 while($j -lt $lines.Length){
  $nl=$lines[$j]; $nt=$nl.Trim()
  if($nt -ne '' -and -not $nl.TrimStart().StartsWith('#')){
   $nind=Get-Indent $nl
   if($nind -le $shipsIndent){break}
   if($nind -eq $itemIndent -and $nl -match '^\s*-\s*'){break}
  }
  $block.Add($nl); $j++
 }
 return @($block,$j,$itemIndent)
}
$files=Get-ChildItem resource/builtin_plans -Filter '周常*.yaml' -File | Sort-Object Name
$rows=@()
foreach($f in $files){
 $lines=[IO.File]::ReadAllLines($f.FullName,[Text.Encoding]::UTF8)
 $out=New-Object System.Collections.Generic.List[string]
 $inFleet=$false;$fleetIndent=-1;$inShips=$false;$shipsIndent=-1
 $nameConverted=0;$shipTypeMinAdded=0;$unchanged=0
 for($i=0;$i -lt $lines.Length;){
  $line=$lines[$i];$t=$line.Trim()
  if($inShips -and $t -ne '' -and -not $line.TrimStart().StartsWith('#') -and (Get-Indent $line) -le $shipsIndent){$inShips=$false}
  if($inFleet -and $t -ne '' -and -not $line.TrimStart().StartsWith('#') -and (Get-Indent $line) -le $fleetIndent -and $line -notmatch '^\s*fleet_presets:\s*$'){$inFleet=$false;$inShips=$false}
  if($line -match '^(\s*)fleet_presets:\s*$'){ $inFleet=$true;$fleetIndent=$matches[1].Length; $out.Add($line);$i++; continue }
  if($inFleet -and $line -match '^(\s*)ships:\s*$'){ $inShips=$true;$shipsIndent=$matches[1].Length; $out.Add($line);$i++; continue }
  if($inShips -and $line -match '^(\s*)-\s*(.*)$' -and $matches[1].Length -gt $shipsIndent){
   $res=Split-ItemBlocks $lines $i $shipsIndent; $block=[string[]]$res[0]; $j=[int]$res[1]; $itemIndent=[int]$res[2]
   $changed=$false
   if(Is-PureString $block){
    $block[0] -match '^(\s*)-\s*(.*)$' | Out-Null; $ws=$matches[1]; $rest=$matches[2].Trim(); $comment=''
    if($rest -match '^(.*?)(\s+#.*)$'){ $rest=$matches[1].TrimEnd(); $comment=$matches[2] }
    $out.Add("$ws- { name: $rest, min_level: 100 }$comment"); $nameConverted++; $changed=$true
   } else {
    $hasType=($block|Where-Object{$_ -match '\bship_type\s*:'}).Count -gt 0
    $hasMin=($block|Where-Object{$_ -match '\bmin_level\s*:'}).Count -gt 0
    if($hasType -and -not $hasMin){
      $first=$block[0]
      if($block.Count -eq 1 -and $first -match '^(\s*)-\s*(.*)$'){
        $ws=$matches[1]; $body=$matches[2].Trim(); $comment=''
        if($body -match '^(.*?)(\s+#.*)$'){ $body=$matches[1].TrimEnd(); $comment=$matches[2] }
        if($body -match '^\{(.*)\}$'){ $inner=$matches[1].Trim(); $newBody = if($inner){"{ $inner, min_level: 100 }"}else{'{ min_level: 100 }'}; $out.Add("$ws- $newBody$comment") }
        else { $out.Add($first); $out.Add((' ' * ($itemIndent+2)) + 'min_level: 100') }
      } else { foreach($b in $block){$out.Add($b)}; $out.Add((' ' * ($itemIndent+2)) + 'min_level: 100') }
      $shipTypeMinAdded++; $changed=$true
    }
   }
   if(-not $changed){ foreach($b in $block){$out.Add($b)}; $unchanged++ }
   $i=$j; continue
  }
  $out.Add($line); $i++
 }
 [IO.File]::WriteAllLines($f.FullName,$out,$utf8)
 $rows += [pscustomobject]@{File=$f.Name;nameConverted=$nameConverted;shipTypeMinAdded=$shipTypeMinAdded;unchanged=$unchanged}
}
$rows | Format-Table -AutoSize

$pure=0;$missing=0
foreach($f in $files){
 $lines=[IO.File]::ReadAllLines($f.FullName,[Text.Encoding]::UTF8)
 $inFleet=$false;$fleetIndent=-1;$inShips=$false;$shipsIndent=-1
 for($i=0;$i -lt $lines.Length;){
  $line=$lines[$i];$t=$line.Trim()
  if($inShips -and $t -ne '' -and -not $line.TrimStart().StartsWith('#') -and (Get-Indent $line) -le $shipsIndent){$inShips=$false}
  if($inFleet -and $t -ne '' -and -not $line.TrimStart().StartsWith('#') -and (Get-Indent $line) -le $fleetIndent -and $line -notmatch '^\s*fleet_presets:\s*$'){$inFleet=$false;$inShips=$false}
  if($line -match '^(\s*)fleet_presets:\s*$'){ $inFleet=$true;$fleetIndent=$matches[1].Length; $i++; continue }
  if($inFleet -and $line -match '^(\s*)ships:\s*$'){ $inShips=$true;$shipsIndent=$matches[1].Length; $i++; continue }
  if($inShips -and $line -match '^(\s*)-\s*(.*)$' -and $matches[1].Length -gt $shipsIndent){
   $res=Split-ItemBlocks $lines $i $shipsIndent; $block=[string[]]$res[0]; $j=[int]$res[1]
   if(Is-PureString $block){$pure++}
   $hasType=($block|Where-Object{$_ -match '\bship_type\s*:'}).Count -gt 0
   $hasMin=($block|Where-Object{$_ -match '\bmin_level\s*:'}).Count -gt 0
   if($hasType -and -not $hasMin){$missing++}
   $i=$j; continue
  }
  $i++
 }
}
"pureStringRemain=$pure shipTypeNoMinRemain=$missing"
if($pure -eq 0 -and $missing -eq 0){ 'WEEKLY_SHIPS_LEVEL_RULES_OK' }
