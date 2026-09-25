param([string]$OutDir = (Join-Path (Split-Path $PSScriptRoot -Parent) "examples"))
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $OutDir | Out-Null
Add-Type -AssemblyName System.Speech
function Write-Example($Name, [string[]]$Parts) {
  $path = Join-Path $OutDir "$Name.wav"
  $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.Rate = -1
  $pb = New-Object System.Speech.Synthesis.PromptBuilder
  foreach($p in $Parts) { if ($p -match '^pause:(\d+)$') { $pb.AppendBreak([TimeSpan]::FromMilliseconds([int]$Matches[1])) } else { $pb.AppendText($p) } }
  $s.SetOutputToWaveFile($path, $fmt); $s.Speak($pb); $s.Dispose()
  Write-Host "wrote $path"
}
Write-Example "voicemail" @("Hi, this is Jennifer Walsh. Call me back at four one five, five five five, zero one three two, or email jennifer dot walsh at contoso dot com.")
Write-Example "support-call" @("Um, the card is four one one one, one one one one, one one one one, one one one one.", "pause:1200", "The address is 742 Evergreen Terrace, and my password is blue falcon ninety nine. You know, thanks.")
