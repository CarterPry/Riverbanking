const Docker = require('dockerode');

async function testDocker() {
  console.log('Testing Docker directly...');
  
  const docker = new Docker();
  
  try {
    // Test 1: List images
    console.log('\n1. Listing Docker images:');
    const images = await docker.listImages();
    console.log(`Found ${images.length} images`);
    
    // Test 2: Check if subfinder image exists
    console.log('\n2. Checking subfinder image:');
    try {
      const image = await docker.getImage('projectdiscovery/subfinder:latest').inspect();
      console.log('✅ Subfinder image exists');
    } catch (e) {
      console.log('❌ Subfinder image not found');
    }
    
    // Test 3: Create and run a simple container
    console.log('\n3. Creating and running container:');
    const container = await docker.createContainer({
      Image: 'projectdiscovery/subfinder:latest',
      Cmd: ['-d', 'google.com', '-silent'],
      HostConfig: {
        AutoRemove: true
      }
    });
    
    console.log('Container created:', container.id);
    
    // Attach to get output
    const stream = await container.attach({ stream: true, stdout: true, stderr: true });
    console.log('Stream attached');
    
    // Start the container
    await container.start();
    console.log('Container started');
    
    // Collect output
    let output = '';
    
    // Handle stream
    stream.on('data', (chunk) => {
      console.log('Got data chunk:', chunk.length, 'bytes');
      output += chunk.toString();
    });
    
    stream.on('end', () => {
      console.log('\nStream ended');
      console.log('Output:', output);
    });
    
    stream.on('error', (err) => {
      console.error('Stream error:', err);
    });
    
    // Wait for container to finish
    await container.wait();
    console.log('\nContainer finished');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

testDocker().catch(console.error);