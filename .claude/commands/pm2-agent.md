Start linkedin-agent and open logs.
```bash
cd "D:/projects/linkedIn" && pm2 start ecosystem.config.cjs --only linkedin-agent && start wt.exe -d "D:/projects/linkedIn" pwsh -NoExit -c "pm2 logs linkedin-agent"
```
