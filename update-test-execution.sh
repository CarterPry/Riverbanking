#!/bin/bash

echo "========================================"
echo "UPDATING TEST EXECUTION ENGINE"
echo "========================================"
echo ""

# Update the testExecutionEngine.ts to use dockerTools.ts
echo "📝 Updating testExecutionEngine.ts..."

# Add import at the top
cd backend/src/execution

# First, check if dockerTools import exists
if ! grep -q "import.*dockerTools" testExecutionEngine.ts; then
  # Add import after other imports
  sed -i.bak '1a\
import { getDockerTool, isToolAvailable, DOCKER_TOOLS } from '\''./dockerTools.js'\'';' testExecutionEngine.ts
fi

# Update the initializeTools method to use dockerTools
cat > update-tools.patch << 'EOF'
--- Original initializeTools
+++ Updated initializeTools
@@ private initializeTools(): void {
+    // Use tools from dockerTools.ts
+    for (const [toolName, dockerTool] of Object.entries(DOCKER_TOOLS)) {
+      this.registerTool({
+        name: toolName,
+        displayName: toolName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
+        description: `Execute ${toolName}`,
+        dockerImage: dockerTool.image,
+        command: '', // Will be built dynamically
+        parameters: [
+          {
+            name: 'target',
+            type: 'string',
+            required: true,
+            description: 'Target to scan'
+          }
+        ],
+        outputParser: this.parseGenericOutput,
+        safetyLevel: 'low',
+        timeout: dockerTool.timeout,
+        owaspCategories: ['A05:2021'],
+        ccControls: ['CC6.6']
+      });
+    }
+
     // Original tool registrations below (kept for reference)
EOF

# Update the runInDocker method
cat > update-rundocker.patch << 'EOF'
  private async runInDocker(image: string, command: string | string[], timeout: number = 300000): Promise<string> {
    try {
      // Pull image if not exists
      try {
        await this.docker.getImage(image).inspect();
      } catch {
        logger.info('Pulling Docker image', { image });
        const stream = await this.docker.pull(image);
        await new Promise((resolve, reject) => {
          this.docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
        });
      }

      // Handle command as array
      const cmd = Array.isArray(command) ? command : command.split(' ').filter(c => c);

      const container = await this.docker.createContainer({
        Image: image,
        Cmd: cmd,
        HostConfig: {
          AutoRemove: true,
          Memory: 512 * 1024 * 1024,
          CpuQuota: 50000,
          SecurityOpt: ['no-new-privileges'],
          ReadonlyRootfs: false,
          NetworkMode: 'bridge'
        }
      });

      const stream = await container.attach({ stream: true, stdout: true, stderr: true });
      await container.start();

      let output = '';
      let stderr = '';
      let timeoutHandle: NodeJS.Timeout;

      return new Promise((resolve, reject) => {
        timeoutHandle = setTimeout(async () => {
          try {
            await container.kill();
          } catch (e) {}
          reject(new Error('Execution timeout'));
        }, timeout);

        container.modem.demuxStream(stream,
          (chunk) => { output += chunk.toString(); },
          (chunk) => { stderr += chunk.toString(); }
        );

        stream.on('end', async () => {
          clearTimeout(timeoutHandle);
          try {
            const info = await container.inspect();
            if (info.State.ExitCode !== 0) {
              logger.error('Container execution failed', {
                exitCode: info.State.ExitCode,
                stderr: stderr.substring(0, 1000),
                output: output.substring(0, 1000)
              });
              // Don't reject, return what we have
              resolve(output || stderr);
            } else {
              resolve(output || stderr);
            }
          } catch {
            resolve(output || stderr);
          }
        });

        stream.on('error', (error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        });
      });
    } catch (error) {
      logger.error('Docker execution failed', {
        image,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
EOF

cd ../../..

echo "✅ Patches created"
echo ""

# Now let's also create a simple test to verify tools work
echo "🧪 Creating tool verification script..."

cat > test-docker-tools.sh << 'EOF'
#!/bin/bash

echo "Testing Docker Tools..."
echo ""

# Test subdomain scanner
echo "1. Testing subdomain scanner..."
docker run --rm projectdiscovery/subfinder:latest -d google.com -silent | head -5

echo ""
echo "2. Testing port scanner..."
docker run --rm instrumentisto/nmap:latest -sV -Pn -p 80,443 google.com

echo ""
echo "3. Testing httpx..."
docker run --rm projectdiscovery/httpx:latest -u https://google.com -tech-detect -silent

echo ""
echo "✅ If you see results above, Docker tools are working!"
EOF

chmod +x test-docker-tools.sh

echo ""
echo "========================================"
echo "✅ Updates prepared!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Apply the patches to testExecutionEngine.ts"
echo "2. Run './test-docker-tools.sh' to verify tools work"
echo "3. Run enumeration test again"
echo ""
echo "Note: The patches need to be manually applied to testExecutionEngine.ts"
echo "Or we can create a new version of the file with all fixes integrated."