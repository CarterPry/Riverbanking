# AI Exhaustive Prompt Update

## What Changed

The AI's system prompt has been completely revamped to ensure **exhaustive, comprehensive testing** that doesn't miss anything.

### Old Approach
- General guidelines for testing
- AI could skip tools it didn't prioritize
- Directory scanning was optional

### New Approach: Chain-of-Thought (CoT) with Self-Critique
- **Exhaustive enumeration** - Lists EVERY asset individually
- **Mandatory self-critique** - AI reviews its own plan for omissions
- **Combinatorial testing** - Tests each finding individually AND in combinations

## Key Features of New Prompt

### 1. Exhaustive Inventory
```
"list EVERY item/asset discovered—e.g., each subdomain, endpoint, vuln individually; 
don't group/summarize prematurely"
```

### 2. Complete OWASP Coverage
```
"Enumerate ALL relevant OWASP Top 10/LLM categories (try all outlets—don't omit ANY 
potentially matching, even low-probability)"
```

### 3. Individual Testing Requirements
```
"treat EVERY discovered item as a separate target—e.g., if 3 subdomains found, 
plan individual tests for EACH + collective combos"
```

### 4. Self-Critique Loop
```
"Self-Critique Initial Hypotheses: Review for omissions ('Have I considered ALL 
combos/pathways from ALL findings? If not, add them now with rationale')"
```

## Example: How It Works

### Input
"Found subdomains: api.site.com, admin.site.com, dev.site.com"

### Old AI Behavior
- Might run directory scanner once on main domain
- Skip some subdomains
- Group tests together

### New AI Behavior
1. **Inventory**: "Found 3 subdomains: api.site.com, admin.site.com, dev.site.com"
2. **Plan Individual Tests**:
   - directory-scanner on api.site.com
   - directory-scanner on admin.site.com  
   - directory-scanner on dev.site.com
   - port-scanner on api.site.com
   - port-scanner on admin.site.com
   - port-scanner on dev.site.com
3. **Self-Critique**: "Did I miss any combinations? Should also test cross-subdomain auth"
4. **Add Missing Tests**: JWT token from api.site.com on admin.site.com

## Updated Phase Prompts

### Reconnaissance Phase
Now explicitly requires:
- Directory scanning on EACH subdomain
- Individual port scanning per subdomain
- Looking for specific paths: /admin, /api, /config, /.git, /swagger, /docs

## Running Tests with New Prompt

### Option 1: Basic Test
```bash
./test-ai-direct.sh
```

### Option 2: Focused Directory Enumeration
```bash
./test-directory-enumeration.sh
```

### Option 3: Full Exhaustive Test (NEW)
```bash
./test-exhaustive-ai.sh
```

## Expected Results

With the new prompt, the AI will:
1. Never skip directory enumeration
2. Test each subdomain individually
3. Consider all possible attack combinations
4. Self-review and add any missing tests
5. Provide detailed reasoning for every decision

## Technical Implementation

The changes were made in:
- `backend/src/services/strategicAIService.ts`
  - `buildSystemPrompt()` - Complete rewrite with CoT approach
  - `buildPhasePrompt()` - Updated recon phase for exhaustive testing

## Monitoring AI Decisions

To see the AI's exhaustive reasoning:
```bash
tail -f backend/logs/app-*.log | grep -E "strategy|recommendations"
```

## Key Benefits

1. **No missed tests** - Self-critique ensures comprehensive coverage
2. **Individual attention** - Each subdomain gets dedicated testing
3. **Combination testing** - Considers cross-subdomain vulnerabilities
4. **Transparent reasoning** - Detailed CoT explanation for every decision
5. **OWASP compliance** - Ensures all categories are considered

The AI is now programmed to be exhaustive by default, eliminating the need for overly specific user instructions.
