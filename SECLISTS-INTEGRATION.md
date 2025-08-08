# SecLists Integration for Directory Enumeration

## What Changed

The AI system now uses professional **SecLists wordlists** for directory enumeration instead of hardcoded directory paths. This provides more comprehensive and industry-standard security testing.

## SecLists Wordlists Referenced

The AI will now use appropriate wordlists from the SecLists collection:

### For Quick Scans
- `Discovery/Web-Content/common.txt` - Common directories and files

### For Comprehensive Coverage  
- `Discovery/Web-Content/directory-list-2.3-medium.txt` - Medium-sized directory list
- `Discovery/Web-Content/raft-large-directories.txt` - Large directory enumeration

### For API Discovery
- `Discovery/Web-Content/api/api-endpoints-mazen160.txt` - API endpoint discovery

## Benefits of Using SecLists

1. **Professional Standard** - SecLists is the industry standard for security testing wordlists
2. **Comprehensive Coverage** - Contains thousands of known directory and file patterns
3. **Categorized Lists** - Different wordlists for different purposes (APIs, admin panels, backups, etc.)
4. **Community Maintained** - Regularly updated with new patterns and discoveries
5. **Performance Options** - From quick (common.txt) to exhaustive (raft-large) scans

## How It Works

When the AI finds subdomains, it will now:

1. Select appropriate SecLists wordlists based on context
2. Plan individual directory scans for EACH subdomain
3. Use different wordlists for different purposes:
   - Quick initial scan with `common.txt`
   - Deeper scan with `directory-list-2.3-medium.txt`
   - API-focused scan with API-specific wordlists

## Example AI Reasoning

### Before (Hardcoded Paths)
```
"Check for paths like: /admin, /api, /config, /backup, /.git, /swagger, /docs"
```

### After (SecLists Integration)
```
"Use SecLists wordlists:
- Discovery/Web-Content/common.txt for initial scan
- Discovery/Web-Content/directory-list-2.3-medium.txt for comprehensive enumeration
- Discovery/Web-Content/api/api-endpoints-mazen160.txt for API discovery"
```

## Impact on Testing

- **More Thorough** - Thousands of paths tested instead of just a handful
- **Context-Aware** - AI selects appropriate wordlists based on findings
- **Scalable** - Can adjust wordlist size based on time constraints
- **Professional** - Aligns with industry-standard penetration testing practices

## Docker Integration

The directory-scanner tool (typically using tools like gobuster, dirb, or ffuf) will automatically use these SecLists wordlists when specified in the parameters.

## Next Steps

Run the updated tests to see SecLists in action:
```bash
./test-exhaustive-ai.sh
```

The AI will now automatically select and use appropriate SecLists wordlists for comprehensive directory enumeration on each discovered subdomain.