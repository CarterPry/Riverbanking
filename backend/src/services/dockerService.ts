import Docker from 'dockerode';
import { Readable } from 'stream';
import { createLogger } from '../utils/logger.js';
import { EventEmitter } from 'events';

const logger = createLogger('DockerService');

export interface ContainerConfig {
  image: string;
  command: string[];
  volumes?: Record<string, string>;
  workingDir?: string;
  environment?: Record<string, string>;
  timeout?: number;
  memory?: string;
  cpuShares?: number;
  networkMode?: string;
  securityOpt?: string[];
}

export interface ContainerResult {
  output: string;
  exitCode: number;
  metrics?: {
    cpuUsage?: number;
    memoryUsage?: number;
    networkRx?: number;
    networkTx?: number;
  };
}

export class DockerService extends EventEmitter {
  private docker: Docker;
  private activeContainers: Map<string, Docker.Container>;
  private pullProgress: Map<string, number>;

  constructor() {
    super();
    this.docker = new Docker({
      socketPath: process.env.DOCKER_HOST || '/var/run/docker.sock'
    });
    this.activeContainers = new Map();
    this.pullProgress = new Map();
  }

  /**
   * Initialize the Docker service
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Docker service');
    
    try {
      // Test Docker connection
      const info = await this.docker.info();
      logger.info('Docker connected', { 
        version: info.ServerVersion,
        containers: info.Containers,
        images: info.Images 
      });

      // Pull required base images
      const requiredImages = [
        'kalilinux/kali-rolling',
        'owasp/zap2docker-stable',
        'drwetter/testssl.sh',
        'metasploitframework/metasploit-framework'
      ];

      await this.pullRequiredImages(requiredImages);
      
    } catch (error) {
      logger.error('Failed to initialize Docker service', { error });
      throw new Error('Docker service initialization failed');
    }
  }

  /**
   * Run a container with the specified configuration
   */
  async runContainer(config: ContainerConfig): Promise<ContainerResult> {
    const containerId = this.generateContainerId();
    logger.info(`Starting container: ${containerId}`, { image: config.image });

    try {
      // Ensure image exists
      await this.ensureImage(config.image);

      // Create container
      const container = await this.createContainer(containerId, config);
      this.activeContainers.set(containerId, container);

      // Start container
      await container.start();

      // Execute command and collect output
      const result = await this.executeAndCollect(container, config);

      // Get container stats before cleanup
      const metrics = await this.getContainerMetrics(container);
      result.metrics = metrics;

      return result;

    } catch (error) {
      logger.error(`Container execution failed: ${containerId}`, { error });
      throw error;
    } finally {
      // Cleanup
      await this.cleanupContainer(containerId);
    }
  }

  /**
   * Create a container with security settings
   */
  private async createContainer(
    containerId: string,
    config: ContainerConfig
  ): Promise<Docker.Container> {
    const createOptions: Docker.ContainerCreateOptions = {
      name: containerId,
      Image: config.image,
      Cmd: config.command,
      WorkingDir: config.workingDir || '/workspace',
      Env: this.formatEnvironment(config.environment),
      HostConfig: {
        AutoRemove: false,
        Memory: this.parseMemory(config.memory || '2g'),
        MemorySwap: this.parseMemory(config.memory || '2g'),
        CpuShares: config.cpuShares || 1024,
        NetworkMode: config.networkMode || 'bridge',
        SecurityOpt: config.securityOpt || [
          'no-new-privileges:true',
          'apparmor:docker-default'
        ],
        ReadonlyRootfs: false,
        Binds: this.formatVolumes(config.volumes)
      },
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: false,
      Tty: false
    };

    return this.docker.createContainer(createOptions);
  }

  /**
   * Execute command and collect output
   */
  private async executeAndCollect(
    container: Docker.Container,
    config: ContainerConfig
  ): Promise<ContainerResult> {
    const output: string[] = [];
    let exitCode = 0;

    // Attach to container streams
    const stream = await container.attach({ 
      stream: true, 
      stdout: true, 
      stderr: true 
    });

    // Set up timeout
    const timeout = config.timeout || 300000; // 5 minutes default
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Container execution timeout')), timeout);
    });

    // Collect output
    const collectPromise = new Promise<void>((resolve, reject) => {
      container.modem.demuxStream(stream, 
        this.createOutputStream(output), 
        this.createOutputStream(output)
      );

      stream.on('end', resolve);
      stream.on('error', reject);
    });

    // Wait for completion or timeout
    try {
      await Promise.race([collectPromise, timeoutPromise]);
      
      // Get exit code
      const info = await container.inspect();
      exitCode = info.State.ExitCode || 0;
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        logger.warn('Container execution timeout, killing container');
        await container.kill();
        throw error;
      }
      throw error;
    }

    return {
      output: output.join(''),
      exitCode
    };
  }

  /**
   * Get container metrics
   */
  private async getContainerMetrics(container: Docker.Container): Promise<any> {
    try {
      const stats = await container.stats({ stream: false });
      
      // Calculate CPU usage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - 
                       stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - 
                          stats.precpu_stats.system_cpu_usage;
      const cpuUsage = (cpuDelta / systemDelta) * 100;

      // Memory usage
      const memoryUsage = stats.memory_stats.usage;

      // Network stats
      const networks = stats.networks || {};
      let networkRx = 0, networkTx = 0;
      
      Object.values(networks).forEach((net: any) => {
        networkRx += net.rx_bytes || 0;
        networkTx += net.tx_bytes || 0;
      });

      return {
        cpuUsage,
        memoryUsage,
        networkRx,
        networkTx
      };
    } catch (error) {
      logger.error('Failed to get container metrics', { error });
      return {};
    }
  }

  /**
   * Pull required images
   */
  private async pullRequiredImages(images: string[]): Promise<void> {
    for (const image of images) {
      try {
        await this.ensureImage(image);
      } catch (error) {
        logger.warn(`Failed to pull image: ${image}`, { error });
      }
    }
  }

  /**
   * Ensure image exists locally
   */
  private async ensureImage(imageName: string): Promise<void> {
    try {
      // Check if image exists
      await this.docker.getImage(imageName).inspect();
      logger.debug(`Image already exists: ${imageName}`);
    } catch (error) {
      // Image doesn't exist, pull it
      logger.info(`Pulling image: ${imageName}`);
      await this.pullImage(imageName);
    }
  }

  /**
   * Pull Docker image with progress tracking
   */
  private async pullImage(imageName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(imageName, (err: any, stream: any) => {
        if (err) return reject(err);

        const onFinished = (err: any) => {
          if (err) return reject(err);
          this.pullProgress.delete(imageName);
          resolve();
        };

        const onProgress = (event: any) => {
          if (event.status === 'Downloading' && event.progressDetail) {
            const progress = (event.progressDetail.current / event.progressDetail.total) * 100;
            this.pullProgress.set(imageName, progress);
            this.emit('pull:progress', { image: imageName, progress });
          }
        };

        this.docker.modem.followProgress(stream, onFinished, onProgress);
      });
    });
  }

  /**
   * Cleanup container
   */
  private async cleanupContainer(containerId: string): Promise<void> {
    const container = this.activeContainers.get(containerId);
    if (!container) return;

    try {
      // Stop container if running
      const info = await container.inspect();
      if (info.State.Running) {
        await container.stop({ t: 5 });
      }

      // Remove container
      await container.remove({ force: true });
      
    } catch (error) {
      logger.error(`Failed to cleanup container: ${containerId}`, { error });
    } finally {
      this.activeContainers.delete(containerId);
    }
  }

  /**
   * List running containers
   */
  async listContainers(): Promise<Docker.ContainerInfo[]> {
    return this.docker.listContainers({
      all: false,
      filters: {
        label: ['managed-by=soc2-testing-platform']
      }
    });
  }

  /**
   * Kill all active containers
   */
  async killAllContainers(): Promise<void> {
    logger.info('Killing all active containers');
    
    const promises = Array.from(this.activeContainers.entries()).map(
      async ([id, container]) => {
        try {
          await container.kill();
          await container.remove({ force: true });
        } catch (error) {
          logger.error(`Failed to kill container: ${id}`, { error });
        }
      }
    );

    await Promise.all(promises);
    this.activeContainers.clear();
  }

  /**
   * Helper functions
   */
  private generateContainerId(): string {
    return `soc2-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  private formatEnvironment(env?: Record<string, string>): string[] {
    if (!env) return [];
    return Object.entries(env).map(([key, value]) => `${key}=${value}`);
  }

  private formatVolumes(volumes?: Record<string, string>): string[] {
    if (!volumes) return [];
    return Object.entries(volumes).map(([host, container]) => `${host}:${container}`);
  }

  private parseMemory(memory: string): number {
    const units: Record<string, number> = {
      b: 1,
      k: 1024,
      m: 1024 * 1024,
      g: 1024 * 1024 * 1024
    };

    const match = memory.match(/^(\d+)([bkmg])?$/i);
    if (!match) throw new Error(`Invalid memory format: ${memory}`);

    const value = parseInt(match[1]);
    const unit = (match[2] || 'b').toLowerCase();
    
    return value * units[unit];
  }

  private createOutputStream(output: string[]): NodeJS.WritableStream {
    const writable = new Readable({
      read() {}
    });

    writable.on('data', (chunk) => {
      output.push(chunk.toString());
    });

    return writable as any;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up Docker service');
    await this.killAllContainers();
  }

  /**
   * Get Docker system information
   */
  async getSystemInfo(): Promise<any> {
    return this.docker.info();
  }

  /**
   * Prune unused resources
   */
  async pruneResources(): Promise<void> {
    logger.info('Pruning Docker resources');
    
    try {
      // Prune containers
      await this.docker.pruneContainers({
        filters: {
          label: ['managed-by=soc2-testing-platform']
        }
      });

      // Prune images
      await this.docker.pruneImages({
        filters: {
          dangling: ['true']
        }
      });

      logger.info('Docker resources pruned successfully');
    } catch (error) {
      logger.error('Failed to prune Docker resources', { error });
    }
  }
} 