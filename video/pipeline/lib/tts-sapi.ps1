# Speaks $TextPath to a 44.1kHz/16-bit/mono WAV using Windows' built-in
# System.Speech voices, and writes real word-level timestamps (from the
# engine's own SpeakProgress event, not estimated) to $TimingPath as JSON.
# This is the zero-setup, zero-API-key voiceover path — see
# pipeline/lib/tts.mjs for when this is chosen over ElevenLabs.
param(
    [Parameter(Mandatory = $true)][string]$TextPath,
    [Parameter(Mandatory = $true)][string]$WavPath,
    [Parameter(Mandatory = $true)][string]$TimingPath,
    [string]$VoiceName = "",
    [int]$Rate = 0
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($VoiceName -and $VoiceName.Trim() -ne "") {
    try { $synth.SelectVoice($VoiceName) } catch { Write-Warning "Voice '$VoiceName' not found, using default." }
}
$synth.Rate = $Rate

$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
    44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono
)
$synth.SetOutputToWaveFile($WavPath, $format)

Register-ObjectEvent -InputObject $synth -EventName SpeakProgress -SourceIdentifier SFSpeakProgress | Out-Null

$text = Get-Content -Raw -Path $TextPath -Encoding UTF8
$synth.Speak($text)
$synth.SetOutputToNull()

$events = Get-Event -SourceIdentifier SFSpeakProgress -ErrorAction SilentlyContinue
$words = @()
foreach ($e in $events) {
    $args = $e.SourceEventArgs
    $words += [PSCustomObject]@{
        text     = $args.Text
        charPos  = $args.CharacterPosition
        audioMs  = [math]::Round($args.AudioPosition.TotalMilliseconds)
    }
}
Unregister-Event -SourceIdentifier SFSpeakProgress -ErrorAction SilentlyContinue

# -InputObject (not a pipeline) keeps $words as one array argument, so
# ConvertTo-Json always emits a JSON array (piping it instead flattens a
# single-element array into a bare object, and a leading-comma wrap to force
# array output pushes the structure past a shallow -Depth into ConvertTo-Json's
# "value/Count" fallback shape — both bit us before this fix).
$json = ConvertTo-Json -InputObject $words -Depth 5
Set-Content -Path $TimingPath -Value $json -Encoding UTF8
