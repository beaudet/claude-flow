/**
 * Claude 4 Max Pro Plan Configuration Example
 * Demonstrates optimal setup for Max Pro subscribers with intelligent quota management
 */

import { ProviderManager, ProviderManagerConfig } from '../src/providers/provider-manager.js';
import { AnthropicProvider } from '../src/providers/anthropic-provider.js';
import { OllamaProvider } from '../src/providers/ollama-provider.js';
import { LLMRequest, MaxProQuotaInfo } from '../src/providers/types.js';
import { Logger } from '../src/core/logger.js';
import { ConfigManager } from '../src/config/config-manager.js';

async function main() {
  console.log('🚀 Claude 4 Max Pro Plan Configuration Example\n');

  // 1. Initialize logger and config manager
  const logger = new Logger('Claude4MaxProExample');
  const configManager = ConfigManager.getInstance();
  await configManager.init();

  // 2. Configure Provider Manager with Claude 4 models and local fallback
  console.log('1. Configuring Provider Manager with Claude 4 models...');
  
  const providerConfig: ProviderManagerConfig = {
    providers: {
      // Anthropic provider with Claude 4 models
      anthropic: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514', // Default to Sonnet
        // No API key needed - uses oauth session from ~/.claude/.credentials.json
        temperature: 0.7,
        maxTokens: 8192, // Claude 4 enhanced output
        timeout: 60000,
        retryAttempts: 3,
        retryDelay: 1000,
        enableStreaming: true,
        enableCaching: true,
        cacheTimeout: 300000, // 5 minutes
      },
      
      // Local Ollama provider for fast tool execution
      ollama: {
        provider: 'ollama',
        model: 'qwen2-7b-instruct', // Your local model
        apiUrl: 'http://localhost:8080', // Your local llama.cpp server
        temperature: 0.3, // Lower for tool execution consistency
        maxTokens: 4096,
        timeout: 30000,
        enableStreaming: true,
      },
    },
    
    defaultProvider: 'anthropic',
    
    // Intelligent fallback strategy
    fallbackStrategy: {
      name: 'max-pro-optimized',
      enabled: true,
      maxAttempts: 3,
      rules: [
        {
          condition: 'rate_limit',
          fallbackProviders: ['ollama'], // Use local when quota exceeded
          retryOriginal: true,
          retryDelay: 300000, // 5 minutes (wait for quota reset)
        },
        {
          condition: 'timeout',
          fallbackProviders: ['ollama'],
          retryOriginal: false,
        },
        {
          condition: 'unavailable',
          fallbackProviders: ['ollama'],
          retryOriginal: true,
          retryDelay: 30000,
        },
      ],
    },
    
    // Cost optimization for Max Pro plan
    costOptimization: {
      enabled: true,
      maxCostPerRequest: 1.0, // $1 max per request
      preferredProviders: ['anthropic', 'ollama'], // Prefer order
    },
    
    // Load balancing with intelligence
    loadBalancing: {
      enabled: true,
      strategy: 'cost-based', // Optimize for quota efficiency
    },
    
    // Caching for efficiency
    caching: {
      enabled: true,
      ttl: 3600, // 1 hour
      maxSize: 100, // 100MB
      strategy: 'lru',
    },
    
    // Monitoring
    monitoring: {
      enabled: true,
      metricsInterval: 60000, // 1 minute
    },
  };

  const providerManager = new ProviderManager(logger, configManager, providerConfig);
  await providerManager['initializeProviders']();
  
  // 3. Initialize Max Pro quota tracking
  console.log('2. Initializing Max Pro quota tracking...');
  
  // Initialize with typical Max Pro limits (adjust based on your actual quota)
  providerManager.initializeMaxProQuota(1000); // 1000 requests per 5-hour cycle
  
  const quota = providerManager.getMaxProQuota()!;
  console.log('Max Pro Quota initialized:', {
    opusLimit: quota.opusQuotaLimit,
    sonnetLimit: quota.sonnetQuotaLimit,
    nextReset: quota.quotaReset.toISOString(),
  });

  // 4. Demonstrate intelligent model selection
  console.log('\n3. Testing intelligent model selection...');
  
  const testRequests: LLMRequest[] = [
    // Strategic task - should use Opus
    {
      messages: [{ role: 'user', content: 'Analyze the strategic implications of our new microservices architecture and provide comprehensive recommendations for optimization.' }],
      model: 'claude-opus-4-20250514',
      quotaConstraints: {
        maxProPlan: quota,
      },
    },
    
    // Regular task - should use Sonnet
    {
      messages: [{ role: 'user', content: 'Write a simple function to validate email addresses in TypeScript.' }],
      model: 'claude-sonnet-4-20250514',
      quotaConstraints: {
        maxProPlan: quota,
      },
    },
    
    // Tool execution task - could prefer local model
    {
      messages: [{ role: 'user', content: 'Run npm test and analyze the output.' }],
      model: 'claude-sonnet-4-20250514',
      providerOptions: {
        preferredProvider: 'ollama', // Prefer local for tool tasks
      },
    },
  ];

  for (let i = 0; i < testRequests.length; i++) {
    const request = testRequests[i];
    console.log(`\nRequest ${i + 1}:`);
    
    // Get optimization recommendation
    const optimization = await providerManager.getMaxProOptimization(request);
    if (optimization) {
      console.log('Optimization:', {
        recommended: optimization.recommendedModel,
        reasoning: optimization.reasoning,
        opusRemaining: optimization.quotaImpact.opusRemaining,
        sonnetRemaining: optimization.quotaImpact.sonnetRemaining,
      });
    }
    
    // Simulate request execution (without actually calling the API)
    console.log('Would execute with optimized model selection');
  }

  // 5. Demonstrate quota exhaustion handling
  console.log('\n4. Testing quota exhaustion scenario...');
  
  // Simulate quota exhaustion
  quota.sonnetQuotaUsed = quota.sonnetQuotaLimit - 1;
  quota.opusQuotaUsed = quota.opusQuotaLimit;
  
  const exhaustedRequest: LLMRequest = {
    messages: [{ role: 'user', content: 'Simple question when quota is nearly exhausted' }],
    model: 'claude-sonnet-4-20250514',
    quotaConstraints: {
      maxProPlan: quota,
    },
  };
  
  const exhaustedOptimization = await providerManager.getMaxProOptimization(exhaustedRequest);
  console.log('Quota exhausted optimization:', {
    recommended: exhaustedOptimization?.recommendedModel,
    reasoning: exhaustedOptimization?.reasoning,
    fallbacks: exhaustedOptimization?.fallbackOptions,
  });

  // 6. Local model preference configuration
  console.log('\n5. Local model preferences...');
  
  const localPreferredRequest: LLMRequest = {
    messages: [{ role: 'user', content: 'Quick code review of this function' }],
    model: 'qwen2-7b-instruct',
    providerOptions: {
      preferredProvider: 'ollama',
    },
  };
  
  console.log('Local model request configured for fast tool execution');

  // 7. Configuration export for reuse
  console.log('\n6. Exporting configuration...');
  
  const exportedConfig = {
    claudeFlow: {
      version: '1.0.0',
      claude4Enabled: true,
      maxProPlan: true,
      quotaManagement: {
        enabled: true,
        resetCycle: '5 hours',
        opusAllocation: 20, // 20%
        sonnetAllocation: 80, // 80%
      },
      providers: {
        anthropic: {
          models: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514'],
          authentication: 'oauth-session', // No API key required
          features: ['hybrid-reasoning', 'extended-thinking', 'enhanced-tools'],
        },
        ollama: {
          models: ['qwen2-7b-instruct'],
          endpoint: 'http://localhost:8080',
          purpose: 'tool-execution-fallback',
        },
      },
      intelligent_routing: {
        strategic_keywords: ['strategic', 'critical', 'architecture', 'comprehensive', 'analysis'],
        use_opus_for: ['high-complexity', 'strategic-decisions', 'comprehensive-analysis'],
        use_sonnet_for: ['general-tasks', 'coding', 'documentation'],
        use_local_for: ['tool-execution', 'fast-responses', 'quota-exhausted'],
      },
    },
  };
  
  console.log('Configuration exported:', JSON.stringify(exportedConfig, null, 2));

  // 8. Performance metrics
  console.log('\n7. Performance summary...');
  
  const metrics = {
    quotaUtilization: {
      opus: `${quota.opusQuotaUsed}/${quota.opusQuotaLimit} (${((quota.opusQuotaUsed / quota.opusQuotaLimit) * 100).toFixed(1)}%)`,
      sonnet: `${quota.sonnetQuotaUsed}/${quota.sonnetQuotaLimit} (${((quota.sonnetQuotaUsed / quota.sonnetQuotaLimit) * 100).toFixed(1)}%)`,
    },
    timeToReset: Math.max(0, quota.quotaReset.getTime() - Date.now()),
    optimizationStrategies: [
      'Strategic tasks → Opus (20% quota)',
      'General tasks → Sonnet (80% quota)', 
      'Tool execution → Local Qwen2',
      'Quota exhausted → Local fallback',
      'Rate limited → Automatic retry after reset',
    ],
  };
  
  console.log('Performance Metrics:', metrics);

  // 9. Best practices summary
  console.log('\n8. Max Pro Best Practices:');
  console.log('✅ Use Claude 4 Opus for strategic, high-complexity tasks');
  console.log('✅ Use Claude 4 Sonnet for general development work');
  console.log('✅ Use local Qwen2 for tool execution and fast responses');
  console.log('✅ Intelligent task classification optimizes quota usage');
  console.log('✅ Automatic fallback prevents service interruption');
  console.log('✅ No API keys required - uses oauth session');
  console.log('✅ 5-hour quota cycles with automatic reset tracking');

  // Cleanup
  providerManager.destroy();
  console.log('\n🎉 Claude 4 Max Pro configuration example completed!');
}

// Additional utility functions for Max Pro optimization

/**
 * Task complexity classifier for optimal model selection
 */
export function classifyTaskComplexity(messages: any[]): 'low' | 'medium' | 'high' {
  const content = messages.map(m => m.content).join(' ').toLowerCase();
  
  const highComplexityIndicators = [
    'architecture', 'strategic', 'comprehensive', 'analysis', 'design', 
    'research', 'optimize', 'performance', 'security', 'scalability'
  ];
  
  const mediumComplexityIndicators = [
    'implement', 'refactor', 'debug', 'test', 'review', 'explain'
  ];
  
  const highMatches = highComplexityIndicators.filter(indicator => content.includes(indicator));
  const mediumMatches = mediumComplexityIndicators.filter(indicator => content.includes(indicator));
  
  if (highMatches.length >= 2 || content.length > 1000) return 'high';
  if (highMatches.length >= 1 || mediumMatches.length >= 2) return 'medium';
  return 'low';
}

/**
 * Generate Max Pro quota tracking dashboard
 */
export function generateQuotaDashboard(quota: MaxProQuotaInfo): string {
  const now = new Date();
  const timeToReset = quota.quotaReset.getTime() - now.getTime();
  const hoursToReset = Math.max(0, timeToReset / (1000 * 60 * 60));
  
  const opusPercentage = (quota.opusQuotaUsed / quota.opusQuotaLimit) * 100;
  const sonnetPercentage = (quota.sonnetQuotaUsed / quota.sonnetQuotaLimit) * 100;
  
  return `
╭─────────────────────────────────────────────────╮
│              Max Pro Quota Dashboard            │
├─────────────────────────────────────────────────┤
│ Opus (Strategic):   ${quota.opusQuotaUsed.toString().padStart(3)}/${quota.opusQuotaLimit.toString().padEnd(3)} (${opusPercentage.toFixed(1).padStart(5)}%)  │
│ Sonnet (General):   ${quota.sonnetQuotaUsed.toString().padStart(3)}/${quota.sonnetQuotaLimit.toString().padEnd(3)} (${sonnetPercentage.toFixed(1).padStart(5)}%)  │
│                                                 │
│ Next Reset: ${hoursToReset.toFixed(1).padStart(4)} hours                    │
│ Cycle Start: ${quota.currentCycleStart.toLocaleTimeString().padEnd(11)}                │
╰─────────────────────────────────────────────────╯
  `;
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}