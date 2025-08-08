# How to Fix Comprehensive Security Testing

## The Problem
The system is only running 4 out of 19 identified tests because:
1. Most attacks don't have corresponding tools mapped
2. No enumeration phase exists
3. Tools that do run are misconfigured

## Quick Fix - Add Missing Tool Mappings

Edit `backend/src/mcp-server/server.ts` line 477 and add:

```typescript
const toolMapping: Record<string, string> = {
  // Existing mappings
  'ssrf': 'api-security-scan',
  'csrf': 'xss-detection',
  'security-misconfig': 'ssl-tls-analysis',
  'auth-failures': 'authentication-brute-force',
  'sql-injection': 'blind-sql-injection',
  'xss': 'xss-detection',
  
  // ADD THESE MISSING MAPPINGS:
  'broken-access-control': 'api-security-scan',
  'cors-misconfig': 'cors-scanner',
  'blind-sql-injection': 'blind-sql-injection',
  'xpath-injection': 'blind-sql-injection',
  'insecure-design': 'ssl-tls-analysis',
  'vulnerable-components': 'dependency-check',
  'integrity-failures': 'api-security-scan',
  'logging-failures': 'ssl-tls-analysis',
  'clickjacking': 'xss-detection',
  'parameter-tampering': 'api-security-scan',
  'port-scanning': 'nmap-scanner',
  'ip-spoofing': 'api-security-scan'
};
```

## Add Enumeration Phase

Create a new attack for subdomain/directory enumeration:

```typescript
// In attack-mapping.ts, add:
{
  id: 'enumeration',
  name: 'Subdomain and Directory Enumeration',
  description: 'Enumerate subdomains and directories',
  category: 'CUSTOM',
  tool: 'enumeration-scanner',
  // ... other fields
}
```

## Fix Tool Configurations

### 1. SQL Injection - Handle WAF
```bash
# Add WAF bypass techniques
--tamper=space2comment --random-agent --level=5 --risk=3
```

### 2. API Security - Provide proper parameters
```bash
# For generic API scanning without spec
-t https://target.com -f graphql -S
```

### 3. SSL/TLS - Reduce timeout
```bash
# Add timeout parameter
--fast --sneaky --timeout 60
```

## The Correct Workflow Should Be:

1. **Enumeration Phase** (MISSING)
   - Subdomain discovery
   - Directory brute-forcing
   - Port scanning
   - API endpoint discovery

2. **Classification Phase** ✓ (Working)
   - AI identifies relevant attacks

3. **Attack Execution** ❌ (Only 4/19 working)
   - Should run ALL identified attacks
   - Should use enumeration results

4. **Reporting** ✓ (Working but with 0 findings)

## To Test Properly:

1. Add the missing tool mappings
2. Restart backend with logging
3. Run the test again
4. Monitor with `./MONITOR-EVERYTHING-NOW.sh`

The system will then execute all 19 tests instead of just 4.