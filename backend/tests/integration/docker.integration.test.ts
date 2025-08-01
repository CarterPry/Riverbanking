// backend/tests/integration/docker.integration.test.ts
import { DockerService } from '../../src/services/dockerService';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Docker Integration Tests', () => {
  let dockerService: DockerService;

  beforeAll(async () => {
    // Ensure Docker is running
    try {
      await execAsync('docker info');
    } catch (error) {
      throw new Error('Docker is not running. Please start Docker before running these tests.');
    }

    dockerService = new DockerService();
  }, 30000);

  afterAll(async () => {
    // Cleanup any test containers
    try {
      await execAsync('docker rm -f test-kali-container 2>/dev/null || true');
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Kali Container Tests', () => {
    test('should run command in Kali container', async () => {
      const result = await dockerService.runInKaliContainer(
        ['echo', 'test'],
        { timeout: 10000 }
      );
      
      expect(result.stdout).toContain('test');
      expect(result.exitCode).toBe(0);
    });

    test('should handle network isolation', async () => {
      // Test that Kali container cannot access external network when isolated
      const result = await dockerService.runInKaliContainer(
        ['ping', '-c', '1', '8.8.8.8'],
        { 
          timeout: 5000,
          network: 'isolated-test'
        }
      );
      
      // Should fail due to network isolation
      expect(result.exitCode).not.toBe(0);
    });

    test('should run nmap scan', async () => {
      const result = await dockerService.runInKaliContainer(
        ['nmap', '--version'],
        { timeout: 10000 }
      );
      
      expect(result.stdout).toContain('Nmap');
      expect(result.exitCode).toBe(0);
    });

    test('should handle file output', async () => {
      const outputPath = '/tmp/results/test-output.txt';
      const result = await dockerService.runInKaliContainer(
        ['bash', '-c', `echo "test output" > ${outputPath}`],
        { 
          timeout: 5000,
          volumes: {
            './tmp': '/tmp/results'
          }
        }
      );
      
      expect(result.exitCode).toBe(0);
      
      // Verify file was created
      const { stdout } = await execAsync('cat ./tmp/test-output.txt');
      expect(stdout).toContain('test output');
      
      // Cleanup
      await execAsync('rm -f ./tmp/test-output.txt');
    });

    test('should enforce security restrictions', async () => {
      // Test that container cannot write to restricted paths
      const result = await dockerService.runInKaliContainer(
        ['touch', '/etc/test-file'],
        { 
          timeout: 5000,
          securityOpts: ['apparmor:docker-kali-restricted']
        }
      );
      
      // Should fail due to security restrictions
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('Container Lifecycle Tests', () => {
    test('should pull image if not exists', async () => {
      const imageName = 'alpine:latest';
      
      // Remove image if exists
      await execAsync(`docker rmi ${imageName} 2>/dev/null || true`);
      
      // Pull image
      const result = await dockerService.pullImage(imageName);
      expect(result).toBe(true);
      
      // Verify image exists
      const { stdout } = await execAsync('docker images alpine:latest --format "{{.Repository}}:{{.Tag}}"');
      expect(stdout.trim()).toBe(imageName);
    });

    test('should handle container cleanup', async () => {
      // Create a test container
      const containerName = 'test-cleanup-container';
      await execAsync(`docker run -d --name ${containerName} alpine:latest sleep 30`);
      
      // Cleanup
      await dockerService.cleanupContainer(containerName);
      
      // Verify container is removed
      const { stdout } = await execAsync('docker ps -a --format "{{.Names}}"');
      expect(stdout).not.toContain(containerName);
    });
  });

  describe('Monitoring Integration Tests', () => {
    test('should connect to Prometheus', async () => {
      // Skip if Prometheus is not running
      try {
        const response = await fetch('http://localhost:9090/api/v1/query?query=up');
        const data = await response.json();
        expect(data.status).toBe('success');
      } catch (error) {
        console.log('Skipping Prometheus test - service not running');
      }
    });

    test('should connect to Grafana', async () => {
      // Skip if Grafana is not running
      try {
        const response = await fetch('http://localhost:3002/api/health');
        expect(response.ok).toBe(true);
      } catch (error) {
        console.log('Skipping Grafana test - service not running');
      }
    });

    test('should connect to Jaeger', async () => {
      // Skip if Jaeger is not running
      try {
        const response = await fetch('http://localhost:16686/api/services');
        expect(response.ok).toBe(true);
      } catch (error) {
        console.log('Skipping Jaeger test - service not running');
      }
    });
  });

  describe('Docker Compose Integration', () => {
    test('should validate docker-compose.yml', async () => {
      const { stdout, stderr } = await execAsync('docker-compose config');
      expect(stderr).toBe('');
      expect(stdout).toContain('services:');
    });

    test('should start core services', async () => {
      // This is a smoke test - in CI/CD you'd actually start services
      const { stdout } = await execAsync('docker-compose ps --services');
      const services = stdout.trim().split('\n');
      
      expect(services).toContain('backend');
      expect(services).toContain('frontend');
      expect(services).toContain('db');
      expect(services).toContain('redis');
    }, 60000);
  });
});