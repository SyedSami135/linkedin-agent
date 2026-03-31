Start linkedin-agent and open PM2 monitor.
```bash
cd "D:/projects/linkedIn" && pm2 start ecosystem.config.cjs && start wt.exe -d "D:/projects/linkedIn" pwsh -NoExit -c "pm2 monit"
```
