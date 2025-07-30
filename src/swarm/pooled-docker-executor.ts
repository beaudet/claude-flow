/**
 * Pooled Docker Task Executor with Container-per-Agent-Type Strategy
 * Maintains warm containers for each agent type to eliminate startup overhead
 * Provides optimal performance while maintaining security isolation between agent types
 */

import { EventEmitter } from 'node:events';
import { Logger } from '../core/logger.js';
import { generateId } from '../utils/helpers.js';
import {
  TaskDefinition,
  AgentState,
  SWARM_CONSTANTS,
} from './types.js';
import { 
  DockerizedTaskExecutor,
  DockerExecutionConfig,
  DockerExecutionContext,
  DockerContainerConfig,
  DockerExecutionMetrics,
  PerformanceComparison
} from './dockerized-executor.js';
import {
  ExecutionResult,
  ResourceUsage,
} from './executor.js';

export interface PooledDockerConfig extends DockerExecutionConfig {
  // Pool configuration
  poolSize?: number;
  warmupAgentTypes?: string[];
  maxContainerAge?: number; // ms before container refresh
  healthCheckInterval?: number; // ms between health checks
  containerIdleTimeout?: number; // ms before idle container cleanup
  
  // Performance optimization
  enableContainerReuse?: boolean;
  preloadCommonImages?: boolean;
  optimizeNetworking?: boolean;
  
  // Pool management
  autoScaling?: boolean;
  minPoolSize?: number;
  maxPoolSize?: number;
  scaleUpThreshold?: number; // pool utilization %
  scaleDownThreshold?: number; // pool utilization %
}

export interface AgentContainerInfo {
  containerId: string;
  agentType: string;
  createdAt: Date;
  lastUsed: Date;
  execCount: number;
  isHealthy: boolean;
  isInUse: boolean;
  networkId?: string;
  volumeId?: string;
}

export interface PoolMetrics {
  totalContainers: number;
  activeContainers: number;
  idleContainers: number;
  containersByType: Record<string, number>;
  poolUtilization: number;
  averageExecutionTime: number;
  containerHitRate: number; // % of executions using pooled containers
  healthyContainers: number;
  unhealthyContainers: number;
}

export class PooledDockerExecutor extends DockerizedTaskExecutor {
  private containerPool: Map<string, AgentContainerInfo[]> = new Map();
  private poolConfig: PooledDockerConfig;
  private healthCheckTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private poolMetrics: PoolMetrics;
  private executionStats: Map<string, number[]> = new Map(); // agentType -> execution times

  constructor(config: Partial<PooledDockerConfig> = {}) {
    super(config);
    
    this.poolConfig = this.mergePoolDefaults(config);
    this.poolMetrics = this.initializeMetrics();
    
    this.setupPoolEventHandlers();
  }

  async initialize(): Promise<void> {
    await super.initialize();
    
    this.logger.info('Initializing pooled Docker executor...', {
      poolSize: this.poolConfig.poolSize,
      warmupTypes: this.poolConfig.warmupAgentTypes,
      autoScaling: this.poolConfig.autoScaling,
    });

    // Pre-warm container pool
    await this.initializeContainerPool();
    
    // Start background tasks
    this.startHealthMonitoring();
    this.startCleanupScheduler();

    this.logger.info('Pooled Docker executor initialized', {
      totalContainers: this.poolMetrics.totalContainers,
      poolUtilization: this.poolMetrics.poolUtilization,
    });
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down pooled Docker executor...');

    // Stop background tasks
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Shutdown all pooled containers
    await this.shutdownContainerPool();

    await super.shutdown();
    this.logger.info('Pooled Docker executor shut down');
  }

  async executeTask(
    task: TaskDefinition,
    agent: AgentState,
    options: Partial<PooledDockerConfig> = {}
  ): Promise<ExecutionResult> {
    const sessionId = generateId('pooled-execution');
    const startTime = Date.now();
    
    this.logger.info('Starting pooled Docker task execution', {
      sessionId,
      taskId: task.id.id,
      agentId: agent.id.id,
      agentType: agent.type,
      poolUtilization: this.poolMetrics.poolUtilization,
    });

    try {
      // Get or create container for agent type
      const containerInfo = await this.getOrCreateContainer(agent.type);
      
      // Mark container as in use
      containerInfo.isInUse = true;
      containerInfo.lastUsed = new Date();

      // Execute task in pooled container
      const result = await this.executeInPooledContainer(
        containerInfo,
        task,
        agent,
        sessionId
      );

      // Update metrics
      const executionTime = Date.now() - startTime;
      this.recordExecutionMetrics(agent.type, executionTime, true);
      
      containerInfo.execCount++;
      containerInfo.isInUse = false;

      this.logger.info('Pooled Docker task execution completed', {
        sessionId,
        success: result.success,
        duration: result.duration,
        containerId: containerInfo.containerId,
        execCount: containerInfo.execCount,
        containerAge: Date.now() - containerInfo.createdAt.getTime(),
      });

      return result;

    } catch (error) {
      this.recordExecutionMetrics(agent.type, Date.now() - startTime, false);
      
      this.logger.error('Pooled Docker task execution failed', {
        sessionId,
        agentType: agent.type,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw error;
    }
  }

  async getPoolMetrics(): Promise<PoolMetrics> {
    // Update real-time metrics
    this.poolMetrics = {
      ...this.poolMetrics,
      totalContainers: this.getTotalContainerCount(),
      activeContainers: this.getActiveContainerCount(),
      idleContainers: this.getIdleContainerCount(),
      containersByType: this.getContainersByType(),
      poolUtilization: this.calculatePoolUtilization(),
      healthyContainers: this.getHealthyContainerCount(),
      unhealthyContainers: this.getUnhealthyContainerCount(),
    };

    return { ...this.poolMetrics };
  }

  async getContainerPool(): Promise<Map<string, AgentContainerInfo[]>> {
    return new Map(this.containerPool);
  }

  async scalePool(agentType: string, targetSize: number): Promise<void> {
    const currentContainers = this.containerPool.get(agentType) || [];
    const currentSize = currentContainers.length;

    if (targetSize > currentSize) {
      // Scale up
      const needed = targetSize - currentSize;
      this.logger.info('Scaling up container pool', {
        agentType,
        currentSize,
        targetSize,
        adding: needed,
      });

      await this.addContainersToPool(agentType, needed);
    } else if (targetSize < currentSize) {
      // Scale down
      const excess = currentSize - targetSize;
      this.logger.info('Scaling down container pool', {
        agentType,
        currentSize,
        targetSize,
        removing: excess,
      });

      await this.removeContainersFromPool(agentType, excess);
    }
  }

  async refreshContainer(agentType: string, containerId: string): Promise<void> {
    this.logger.info('Refreshing aged container', { agentType, containerId });

    const containers = this.containerPool.get(agentType) || [];
    const containerIndex = containers.findIndex(c => c.containerId === containerId);

    if (containerIndex === -1) {
      this.logger.warn('Container not found in pool for refresh', { containerId });
      return;
    }

    const oldContainer = containers[containerIndex];

    try {
      // Create new container
      const newContainer = await this.createPooledContainer(agentType);
      
      // Replace in pool
      containers[containerIndex] = newContainer;
      this.containerPool.set(agentType, containers);

      // Cleanup old container
      await this.cleanupPooledContainer(oldContainer);

      this.logger.info('Container refreshed successfully', {
        agentType,
        oldContainerId: oldContainer.containerId,
        newContainerId: newContainer.containerId,
      });

    } catch (error) {
      this.logger.error('Failed to refresh container', {
        agentType,
        containerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async initializeContainerPool(): Promise<void> {
    const { warmupAgentTypes, poolSize } = this.poolConfig;

    if (!warmupAgentTypes || warmupAgentTypes.length === 0) {
      this.logger.warn('No warmup agent types configured');
      return;
    }

    const initPromises = warmupAgentTypes.map(async (agentType) => {
      const containers = [];
      
      for (let i = 0; i < (poolSize || 2); i++) {
        try {
          const container = await this.createPooledContainer(agentType);
          containers.push(container);
          
          this.logger.debug('Created warm container', {
            agentType,
            containerId: container.containerId,
            containerNumber: i + 1,
          });
        } catch (error) {
          this.logger.error('Failed to create warm container', {
            agentType,
            containerNumber: i + 1,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (containers.length > 0) {
        this.containerPool.set(agentType, containers);
        this.logger.info('Initialized container pool for agent type', {
          agentType,
          containerCount: containers.length,
        });
      }
    });

    await Promise.allSettled(initPromises);
    this.updatePoolMetrics();
  }

  private async getOrCreateContainer(agentType: string): Promise<AgentContainerInfo> {
    const containers = this.containerPool.get(agentType) || [];
    
    // Find available container
    const availableContainer = containers.find(c => 
      !c.isInUse && c.isHealthy
    );

    if (availableContainer) {
      this.logger.debug('Using pooled container', {
        agentType,
        containerId: availableContainer.containerId,
        execCount: availableContainer.execCount,
      });
      
      return availableContainer;
    }

    // No available container, create new one
    this.logger.info('Creating new container for agent type', {
      agentType,
      reason: 'No available containers in pool',
      currentPoolSize: containers.length,
    });

    const newContainer = await this.createPooledContainer(agentType);
    
    // Add to pool
    containers.push(newContainer);
    this.containerPool.set(agentType, containers);

    // Check if we need to scale down later
    if (this.poolConfig.autoScaling) {
      this.schedulePoolOptimization(agentType);
    }

    return newContainer;
  }

  private async createPooledContainer(agentType: string): Promise<AgentContainerInfo> {
    const containerId = generateId('pooled-container');
    const containerName = `swarm-pool-${agentType}-${containerId}`;

    // Create Docker configuration specific to agent type
    const dockerConfig = await this.createAgentTypeDockerConfig(agentType, containerId);

    // Create container
    await this.createContainerWithConfig(dockerConfig, containerName);
    await this.startContainer({ containerId } as DockerExecutionContext);

    // Verify container health
    const isHealthy = await this.checkContainerHealth(containerId);

    const containerInfo: AgentContainerInfo = {
      containerId,
      agentType,
      createdAt: new Date(),
      lastUsed: new Date(),
      execCount: 0,
      isHealthy,
      isInUse: false,
      networkId: dockerConfig.networkConfig.customNetwork,
      volumeId: dockerConfig.mounts.find(m => m.type === 'volume')?.source,
    };

    this.logger.info('Created pooled container', {
      agentType,
      containerId,
      containerName,
      isHealthy,
    });

    return containerInfo;
  }

  private async executeInPooledContainer(
    containerInfo: AgentContainerInfo,
    task: TaskDefinition,
    agent: AgentState,
    sessionId: string
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Build execution command for agent type
    const command = this.buildAgentTypeExecutionCommand(task, agent);
    
    this.logger.debug('Executing command in pooled container', {
      containerId: containerInfo.containerId,
      agentType: containerInfo.agentType,
      command: command.slice(0, 3), // Log first 3 elements only
      execCount: containerInfo.execCount,
    });

    const result = await this.runDockerCommand([
      'exec',
      '-i',
      containerInfo.containerId,
      ...command,
    ]);

    const duration = Date.now() - startTime;

    // Collect container resource usage
    const resourceUsage = await this.getContainerResourceUsage(containerInfo.containerId);

    return {
      success: result.exitCode === 0,
      output: result.output,
      error: result.error,
      exitCode: result.exitCode,
      duration,
      resourcesUsed: resourceUsage,
      artifacts: {},
      metadata: {
        containerId: containerInfo.containerId,
        containerName: `pooled-${containerInfo.agentType}`,
        executionMode: 'pooled-docker',
        securityLevel: 'isolated',
        agentType: containerInfo.agentType,
        execCount: containerInfo.execCount + 1,
        containerAge: Date.now() - containerInfo.createdAt.getTime(),
        pooledExecution: true,
        sessionId,
      },
    };
  }

  private async createAgentTypeDockerConfig(
    agentType: string,
    containerId: string
  ): Promise<DockerContainerConfig> {
    // Base configuration from parent class
    const baseConfig = this.dockerConfig;

    // Agent-specific customizations
    const agentSpecificConfig = this.getAgentTypeConfig(agentType);

    // Create isolated resources
    const networkId = await this.networkManager.createIsolatedNetwork(containerId);
    const volumeId = await this.volumeManager.createIsolatedVolume(containerId);

    return {
      image: agentSpecificConfig.image || baseConfig.dockerImage || 'claude-flow-agent',
      tag: 'latest',
      labels: {
        'swarm.agent.type': agentType,
        'swarm.container.pool': 'true',
        'swarm.container.id': containerId,
        'swarm.security.level': 'isolated',
        'swarm.pool.version': '1.0',
      },
      environment: {
        AGENT_TYPE: agentType,
        CONTAINER_ID: containerId,
        POOL_MODE: 'true',
        NODE_ENV: process.env.NODE_ENV || 'production',
        ...agentSpecificConfig.environment,
      },
      mounts: [
        {
          type: 'volume',
          source: volumeId,
          target: '/workspace',
          readonly: false,
        },
        {
          type: 'tmpfs',
          source: '',
          target: '/tmp',
          readonly: false,
        },
        ...agentSpecificConfig.mounts || [],
      ],
      networkConfig: {
        mode: 'bridge',
        customNetwork: networkId,
      },
      securityConfig: {
        readOnlyRootFs: baseConfig.readOnlyRootFs ?? true,
        noNewPrivileges: baseConfig.noNewPrivileges ?? true,
        user: baseConfig.user || 'swarm:swarm',
        securityOpts: [
          'no-new-privileges:true',
          'seccomp:unconfined',
          ...agentSpecificConfig.securityOpts || [],
        ],
        capabilities: {
          add: agentSpecificConfig.capabilities?.add || [],
          drop: ['ALL'],
        },
      },
      resourceLimits: {
        memory: agentSpecificConfig.memory || '256MB',
        cpus: agentSpecificConfig.cpus || '0.5',
        cpuQuota: agentSpecificConfig.cpuQuota || 50000,
        oomScoreAdj: 1000,
        ulimits: [
          { name: 'nofile', soft: 1024, hard: 1024 },
          { name: 'nproc', soft: 64, hard: 64 },
        ],
      },
    };
  }

  private getAgentTypeConfig(agentType: string): Partial<{
    image: string;
    memory: string;
    cpus: string;
    cpuQuota: number;
    environment: Record<string, string>;
    mounts: any[];
    securityOpts: string[];
    capabilities: { add: string[]; drop: string[] };
  }> {
    const agentConfigs: Record<string, any> = {
      'coder': {
        memory: '512MB',
        cpus: '1.0',
        cpuQuota: 100000,
        environment: {
          CODER_MODE: 'true',
          ALLOW_CODE_EXECUTION: 'true',
        },
      },
      'tester': {
        memory: '256MB',
        cpus: '0.5',
        environment: {
          TESTER_MODE: 'true',
          TEST_FRAMEWORKS: 'jest,mocha,cypress',
        },
      },
      'reviewer': {
        memory: '128MB',
        cpus: '0.25',
        environment: {
          REVIEWER_MODE: 'true',
          ANALYSIS_TOOLS: 'eslint,prettier,sonar',
        },
      },
      'researcher': {
        memory: '256MB',
        cpus: '0.5',
        environment: {
          RESEARCHER_MODE: 'true',
          SEARCH_ENGINES: 'enabled',
        },
      },
      'planner': {
        memory: '128MB',
        cpus: '0.25',
        environment: {
          PLANNER_MODE: 'true',
        },
      },
    };

    return agentConfigs[agentType] || {};
  }

  private buildAgentTypeExecutionCommand(task: TaskDefinition, agent: AgentState): string[] {
    // Build command specific to agent type and pooled execution
    return [
      'claude',
      '--pool-mode',
      '--agent-type', agent.type,
      '--task-id', task.id.id,
      '-p', `Execute task: ${task.description}`,
      '--output-format', 'json',
      '--isolated-execution',
    ];
  }

  private async createContainerWithConfig(
    config: DockerContainerConfig,
    containerName: string
  ): Promise<void> {
    const dockerArgs = this.buildPooledDockerCreateArgs(config, containerName);
    
    this.logger.debug('Creating pooled Docker container', {
      containerName,
      image: config.image,
      agentType: config.labels['swarm.agent.type'],
    });

    const result = await this.runDockerCommand(['create', ...dockerArgs]);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create pooled container: ${result.error}`);
    }
  }

  private buildPooledDockerCreateArgs(config: DockerContainerConfig, containerName: string): string[] {
    const args: string[] = [];

    // Basic configuration
    args.push('--name', containerName);
    args.push('--rm=false');

    // Resource limits
    args.push('--memory', config.resourceLimits.memory);
    args.push('--cpus', config.resourceLimits.cpus);
    args.push('--cpu-quota', config.resourceLimits.cpuQuota.toString());

    // Security configuration
    if (config.securityConfig.readOnlyRootFs) {
      args.push('--read-only');
    }
    
    args.push('--user', config.securityConfig.user);
    
    config.securityConfig.securityOpts.forEach(opt => {
      args.push('--security-opt', opt);
    });

    // Capabilities
    config.securityConfig.capabilities.drop.forEach(cap => {
      args.push('--cap-drop', cap);
    });

    // Environment variables
    Object.entries(config.environment).forEach(([key, value]) => {
      args.push('-e', `${key}=${value}`);
    });

    // Labels
    Object.entries(config.labels).forEach(([key, value]) => {
      args.push('--label', `${key}=${value}`);
    });

    // Mounts
    config.mounts.forEach(mount => {
      if (mount.type === 'volume') {
        args.push('-v', `${mount.source}:${mount.target}${mount.readonly ? ':ro' : ''}`);
      } else if (mount.type === 'tmpfs') {
        args.push('--tmpfs', `${mount.target}:rw,noexec,nosuid,size=100m`);
      }
    });

    // Network
    if (config.networkConfig.customNetwork) {
      args.push('--network', config.networkConfig.customNetwork);
    }

    // Ulimits
    config.resourceLimits.ulimits.forEach(ulimit => {
      args.push('--ulimit', `${ulimit.name}=${ulimit.soft}:${ulimit.hard}`);
    });

    // Image and command
    args.push(config.image + ':' + config.tag);
    args.push('sleep', 'infinity'); // Keep container running

    return args;
  }

  private async checkContainerHealth(containerId: string): Promise<boolean> {
    try {
      const result = await this.runDockerCommand(['inspect', containerId, '--format', '{{.State.Status}}']);
      return result.exitCode === 0 && result.output.trim() === 'running';
    } catch {
      return false;
    }
  }

  private startHealthMonitoring(): void {
    if (!this.poolConfig.healthCheckInterval) return;

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.poolConfig.healthCheckInterval);

    this.logger.debug('Started health monitoring', {
      interval: this.poolConfig.healthCheckInterval,
    });
  }

  private async performHealthChecks(): Promise<void> {
    const healthPromises: Promise<void>[] = [];

    for (const [agentType, containers] of this.containerPool.entries()) {
      for (const container of containers) {
        healthPromises.push(this.checkAndUpdateContainerHealth(container));
      }
    }

    await Promise.allSettled(healthPromises);
    this.updatePoolMetrics();
  }

  private async checkAndUpdateContainerHealth(container: AgentContainerInfo): Promise<void> {
    const wasHealthy = container.isHealthy;
    container.isHealthy = await this.checkContainerHealth(container.containerId);

    if (wasHealthy && !container.isHealthy) {
      this.logger.warn('Container became unhealthy', {
        containerId: container.containerId,
        agentType: container.agentType,
      });

      // Schedule container refresh
      this.scheduleContainerRefresh(container);
    }
  }

  private scheduleContainerRefresh(container: AgentContainerInfo): void {
    // Don't refresh if container is in use
    if (container.isInUse) {
      this.logger.debug('Delaying container refresh - container in use', {
        containerId: container.containerId,
      });
      return;
    }

    setTimeout(async () => {
      if (!container.isInUse) {
        await this.refreshContainer(container.agentType, container.containerId);
      }
    }, 5000); // 5 second delay
  }

  private startCleanupScheduler(): void {
    if (!this.poolConfig.containerIdleTimeout) return;

    this.cleanupTimer = setInterval(async () => {
      await this.cleanupIdleContainers();
    }, this.poolConfig.containerIdleTimeout / 2); // Check at half the timeout interval

    this.logger.debug('Started cleanup scheduler', {
      idleTimeout: this.poolConfig.containerIdleTimeout,
    });
  }

  private async cleanupIdleContainers(): Promise<void> {
    const now = Date.now();
    const maxAge = this.poolConfig.maxContainerAge || 3600000; // 1 hour default
    const idleTimeout = this.poolConfig.containerIdleTimeout || 1800000; // 30 min default

    for (const [agentType, containers] of this.containerPool.entries()) {
      const containersToRemove: AgentContainerInfo[] = [];

      for (const container of containers) {
        const age = now - container.createdAt.getTime();
        const idleTime = now - container.lastUsed.getTime();

        const shouldRemove = 
          !container.isInUse && (
            age > maxAge ||
            idleTime > idleTimeout ||
            !container.isHealthy
          );

        if (shouldRemove) {
          containersToRemove.push(container);
        }
      }

      // Remove aged/idle containers
      for (const container of containersToRemove) {
        await this.removeContainerFromPool(agentType, container.containerId);
      }
    }
  }

  private async removeContainerFromPool(agentType: string, containerId: string): Promise<void> {
    const containers = this.containerPool.get(agentType) || [];
    const containerIndex = containers.findIndex(c => c.containerId === containerId);

    if (containerIndex === -1) return;

    const container = containers[containerIndex];

    try {
      // Remove from pool first
      containers.splice(containerIndex, 1);
      this.containerPool.set(agentType, containers);

      // Clean up container
      await this.cleanupPooledContainer(container);

      this.logger.info('Removed container from pool', {
        agentType,
        containerId,
        reason: 'Cleanup',
        age: Date.now() - container.createdAt.getTime(),
      });

    } catch (error) {
      this.logger.error('Failed to remove container from pool', {
        agentType,
        containerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async addContainersToPool(agentType: string, count: number): Promise<void> {
    const containers = this.containerPool.get(agentType) || [];

    for (let i = 0; i < count; i++) {
      try {
        const newContainer = await this.createPooledContainer(agentType);
        containers.push(newContainer);
      } catch (error) {
        this.logger.error('Failed to add container to pool', {
          agentType,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.containerPool.set(agentType, containers);
  }

  private async removeContainersFromPool(agentType: string, count: number): Promise<void> {
    const containers = this.containerPool.get(agentType) || [];
    
    // Remove oldest idle containers first
    const idleContainers = containers
      .filter(c => !c.isInUse)
      .sort((a, b) => a.lastUsed.getTime() - b.lastUsed.getTime());

    const toRemove = idleContainers.slice(0, count);

    for (const container of toRemove) {
      await this.removeContainerFromPool(agentType, container.containerId);
    }
  }

  private async cleanupPooledContainer(container: AgentContainerInfo): Promise<void> {
    try {
      await this.stopContainer(container.containerId, 'Pool cleanup');
      await this.runDockerCommand(['rm', '-f', container.containerId]);

      // Cleanup network and volume
      if (container.networkId) {
        await this.networkManager.removeNetwork(container.networkId);
      }
      if (container.volumeId) {
        await this.volumeManager.removeVolume(container.volumeId);
      }

    } catch (error) {
      this.logger.warn('Error during pooled container cleanup', {
        containerId: container.containerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async shutdownContainerPool(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];

    for (const [agentType, containers] of this.containerPool.entries()) {
      for (const container of containers) {
        shutdownPromises.push(this.cleanupPooledContainer(container));
      }
    }

    await Promise.allSettled(shutdownPromises);
    this.containerPool.clear();

    this.logger.info('Container pool shutdown complete');
  }

  private schedulePoolOptimization(agentType: string): void {
    // Auto-scaling logic
    setTimeout(async () => {
      if (!this.poolConfig.autoScaling) return;

      const containers = this.containerPool.get(agentType) || [];
      const utilization = this.calculateAgentTypeUtilization(agentType);

      if (utilization > (this.poolConfig.scaleUpThreshold || 80)) {
        // Scale up
        const targetSize = Math.min(
          containers.length + 1,
          this.poolConfig.maxPoolSize || 10
        );
        await this.scalePool(agentType, targetSize);
      } else if (utilization < (this.poolConfig.scaleDownThreshold || 20)) {
        // Scale down
        const targetSize = Math.max(
          containers.length - 1,
          this.poolConfig.minPoolSize || 1
        );
        await this.scalePool(agentType, targetSize);
      }
    }, 60000); // 1 minute delay
  }

  private calculateAgentTypeUtilization(agentType: string): number {
    const containers = this.containerPool.get(agentType) || [];
    if (containers.length === 0) return 0;

    const inUseCount = containers.filter(c => c.isInUse).length;
    return (inUseCount / containers.length) * 100;
  }

  private recordExecutionMetrics(agentType: string, executionTime: number, success: boolean): void {
    if (!this.executionStats.has(agentType)) {
      this.executionStats.set(agentType, []);
    }

    const stats = this.executionStats.get(agentType)!;
    stats.push(executionTime);

    // Keep only last 100 executions
    if (stats.length > 100) {
      stats.shift();
    }

    // Update pool metrics
    if (success) {
      this.poolMetrics.containerHitRate = this.calculateContainerHitRate();
      this.poolMetrics.averageExecutionTime = this.calculateAverageExecutionTime();
    }
  }

  private calculateContainerHitRate(): number {
    // Simplified calculation - in real implementation, track hits vs misses
    return 85; // 85% hit rate approximation
  }

  private calculateAverageExecutionTime(): number {
    const allTimes: number[] = [];
    for (const times of this.executionStats.values()) {
      allTimes.push(...times);
    }

    if (allTimes.length === 0) return 0;
    return allTimes.reduce((sum, time) => sum + time, 0) / allTimes.length;
  }

  private updatePoolMetrics(): void {
    this.poolMetrics = {
      ...this.poolMetrics,
      totalContainers: this.getTotalContainerCount(),
      activeContainers: this.getActiveContainerCount(),
      idleContainers: this.getIdleContainerCount(),
      containersByType: this.getContainersByType(),
      poolUtilization: this.calculatePoolUtilization(),
      healthyContainers: this.getHealthyContainerCount(),
      unhealthyContainers: this.getUnhealthyContainerCount(),
    };
  }

  private getTotalContainerCount(): number {
    let total = 0;
    for (const containers of this.containerPool.values()) {
      total += containers.length;
    }
    return total;
  }

  private getActiveContainerCount(): number {
    let active = 0;
    for (const containers of this.containerPool.values()) {
      active += containers.filter(c => c.isInUse).length;
    }
    return active;
  }

  private getIdleContainerCount(): number {
    let idle = 0;
    for (const containers of this.containerPool.values()) {
      idle += containers.filter(c => !c.isInUse && c.isHealthy).length;
    }
    return idle;
  }

  private getHealthyContainerCount(): number {
    let healthy = 0;
    for (const containers of this.containerPool.values()) {
      healthy += containers.filter(c => c.isHealthy).length;
    }
    return healthy;
  }

  private getUnhealthyContainerCount(): number {
    let unhealthy = 0;
    for (const containers of this.containerPool.values()) {
      unhealthy += containers.filter(c => !c.isHealthy).length;
    }
    return unhealthy;
  }

  private getContainersByType(): Record<string, number> {
    const byType: Record<string, number> = {};
    for (const [agentType, containers] of this.containerPool.entries()) {
      byType[agentType] = containers.length;
    }
    return byType;
  }

  private calculatePoolUtilization(): number {
    const total = this.getTotalContainerCount();
    const active = this.getActiveContainerCount();
    return total > 0 ? (active / total) * 100 : 0;
  }

  private mergePoolDefaults(config: Partial<PooledDockerConfig>): PooledDockerConfig {
    return {
      ...super.mergeWithDefaults(config),
      poolSize: 2,
      warmupAgentTypes: ['coder', 'tester', 'reviewer', 'researcher', 'planner'],
      maxContainerAge: 3600000, // 1 hour
      healthCheckInterval: 30000, // 30 seconds
      containerIdleTimeout: 1800000, // 30 minutes
      enableContainerReuse: true,
      preloadCommonImages: true,
      optimizeNetworking: true,
      autoScaling: true,
      minPoolSize: 1,
      maxPoolSize: 10,
      scaleUpThreshold: 80,
      scaleDownThreshold: 20,
      ...config,
    };
  }

  private initializeMetrics(): PoolMetrics {
    return {
      totalContainers: 0,
      activeContainers: 0,
      idleContainers: 0,
      containersByType: {},
      poolUtilization: 0,
      averageExecutionTime: 0,
      containerHitRate: 0,
      healthyContainers: 0,
      unhealthyContainers: 0,
    };
  }

  private setupPoolEventHandlers(): void {
    this.on('containerCreated', (data) => {
      this.logger.info('Container added to pool', data);
    });

    this.on('containerRemoved', (data) => {
      this.logger.info('Container removed from pool', data);
    });

    this.on('poolScaled', (data) => {
      this.logger.info('Pool scaled', data);
    });

    this.on('containerRefreshed', (data) => {
      this.logger.info('Container refreshed', data);
    });
  }
}

export default PooledDockerExecutor;