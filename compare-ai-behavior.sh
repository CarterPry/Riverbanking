#!/bin/bash

echo "=================================================="
echo "📊 AI Behavior Comparison: Old vs New Prompt"
echo "=================================================="
echo ""
echo "SCENARIO: Found 3 subdomains (api, admin, dev)"
echo ""
echo "❌ OLD AI BEHAVIOR:"
echo "   - Runs subdomain-scanner ✓"
echo "   - Runs port-scanner on one subdomain"
echo "   - Skips directory-scanner (not prioritized)"
echo "   - Groups tests together"
echo "   - Total tests: ~3-4"
echo ""
echo "✅ NEW AI BEHAVIOR (Exhaustive):"
echo "   - Runs subdomain-scanner ✓"
echo "   - Creates 3 separate directory-scanner tests (one per subdomain)"
echo "   - Creates 3 separate port-scanner tests (one per subdomain)"
echo "   - Creates 3 separate tech-fingerprint tests (one per subdomain)"
echo "   - Self-critiques: 'Did I miss cross-subdomain tests?'"
echo "   - Adds JWT token replay tests between subdomains"
echo "   - Total tests: ~12-15"
echo ""
echo "🎯 KEY DIFFERENCE:"
echo "Old: AI decides what's 'important enough' to test"
echo "New: AI tests EVERYTHING exhaustively, then self-reviews"
echo ""
echo "📝 EXAMPLE OUTPUT DIFFERENCE:"
echo ""
echo "Old reasoning:"
echo '  "Found subdomains. Will scan for vulnerabilities."'
echo ""
echo "New reasoning:"
echo '  "Inventory: api.site.com, admin.site.com, dev.site.com (3 subdomains).'
echo '   OWASP A05 (Security Misconfig): Need directory scan on EACH.'
echo '   Plan: dir-scan-api, dir-scan-admin, dir-scan-dev.'
echo '   Self-critique: Also need to test token reuse between subdomains.'
echo '   Adding: jwt-crossdomain-test."'
echo ""
echo "To see this in action, run:"
echo "  ./restart-backend-with-new-prompt.sh"
echo "  ./test-exhaustive-ai.sh"
