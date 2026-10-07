# SOP team server watchdog: auto-restart on crash
$node = "node"
$script = "D:\codex-demo\sop-site\server\server.js"
$log = "D:\codex-demo\sop-site\server\watchdog.log"
while ($true) {
    try {
        & $node $script 2>&1 | Tee-Object -FilePath $log -Append
    } catch {
        $_ | Out-File -FilePath $log -Append
    }
    Start-Sleep -Seconds 3
}
