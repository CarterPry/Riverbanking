#!/bin/bash
# Setup SecLists for universal access across all containers

echo "🔧 Setting up SecLists..."

# Create directory if it doesn't exist
mkdir -p ./seclists

# Clone SecLists if not already present
if [ ! -d "./seclists/.git" ]; then
    echo "📥 Cloning SecLists repository..."
    git clone --depth 1 https://github.com/danielmiessler/SecLists.git ./seclists
else
    echo "🔄 Updating SecLists..."
    cd ./seclists
    git pull
    cd ..
fi

# Create a quick reference file
cat > ./seclists/WORDLISTS_REFERENCE.md << 'REFERENCE'
# SecLists Quick Reference

## Common Wordlists for Directory Enumeration

### Quick Scan (Fast)
- `/seclists/Discovery/Web-Content/common.txt` (~4,700 entries)
- `/seclists/Discovery/Web-Content/quickhits.txt` (~2,200 entries)

### Comprehensive Scan (Thorough)
- `/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt` (~220,000 entries)
- `/seclists/Discovery/Web-Content/directory-list-2.3-big.txt` (~1.2M entries)

### API Discovery
- `/seclists/Discovery/Web-Content/api/api-endpoints-mazen160.txt`
- `/seclists/Discovery/Web-Content/api/api-seen-in-wild.txt`

### Technology Specific
- `/seclists/Discovery/Web-Content/PHP.fuzz.txt`
- `/seclists/Discovery/Web-Content/IIS.fuzz.txt`
- `/seclists/Discovery/Web-Content/nginx.txt`
REFERENCE

echo "✅ SecLists setup complete!"
echo "📁 Location: ./seclists/"
echo "📋 Reference: ./seclists/WORDLISTS_REFERENCE.md"
