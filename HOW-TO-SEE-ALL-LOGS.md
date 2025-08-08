# HOW TO SEE ALL LOGS - COMPLETE GUIDE

## THE PROBLEM
The backend is logging to console (stdout) NOT to files. That's why the monitoring scripts weren't showing anything - they were looking at old/empty log files!

## THE SOLUTION - 3 STEPS

### Step 1: Stop Current Backend
Find the terminal where you ran `npm run dev` and press `Ctrl+C`

### Step 2: Restart Backend with Log Capture
```bash
cd backend && npm run dev 2>&1 | tee ../logs/backend-live.log
```

This command:
- Runs the backend normally
- Shows output in console (so you can see it)
- ALSO saves everything to `logs/backend-live.log`

### Step 3: Monitor Everything
In a NEW terminal:
```bash
./MONITOR-EVERYTHING-NOW.sh
```

## WHAT YOU'LL SEE

The monitor will show EVERYTHING:

```
[10:17:19] [AI-CLASSIFY] Classification complete
  • Intent: SECURITY_TEST
  • Confidence: 87.6%
  • Matched Attacks: 19
  • Top Match: SQL Injection

[10:17:19] [ATTACK-start] Tool: blind-sql-injection
  → Container: soc2-test-1754327928433-hm292

[10:17:19] [DOCKER] Starting container: soc2-test-1754327928433-hm292
  → Image: secsi/sqlmap:latest

[10:17:19] [API] POST /api/run-soc2-workflow
  → Request: {"target":"https://console.sweetspotgov.com",...}
```

## ALTERNATIVE: Quick Commands

If you just want raw logs without formatting:
```bash
# See everything as it happens
tail -f logs/backend-live.log

# See only AI classification
tail -f logs/backend-live.log | grep IntentClassifier

# See only attacks
tail -f logs/backend-live.log | grep attack_execution

# See only Docker containers
tail -f logs/backend-live.log | grep DockerService
```

## TROUBLESHOOTING

### "No active log files found"
- Backend is not running with log capture
- Solution: Restart backend with the tee command above

### "Backend already running"
- Find the terminal running npm run dev
- Stop it with Ctrl+C
- Restart with log capture

### "Can't see new logs"
- Make sure you're monitoring the RIGHT file: `logs/backend-live.log`
- NOT the old files in `backend/logs/`

## SUMMARY

**YOU MUST RESTART THE BACKEND WITH LOG CAPTURE TO SEE LOGS**

The command again:
```bash
cd backend && npm run dev 2>&1 | tee ../logs/backend-live.log
```

Then monitor with:
```bash
./MONITOR-EVERYTHING-NOW.sh
```

This will show you EVERYTHING:
- Every AI request and response
- Every embedding generation
- Every security tool execution
- Every Docker container started
- Every API call made
- Complete workflow execution traces