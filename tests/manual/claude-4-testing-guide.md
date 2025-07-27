# Claude 4 Max Pro Testing Guide

This guide provides comprehensive testing approaches for the Claude 4 Max Pro plan upgrade.

## 🧪 Testing Approaches

### 1. Unit Tests (Automated)

**Location**: `tests/integration/claude-4-maxpro.test.ts`

```bash
# Run the integration tests
npm test -- --testPathPattern=claude-4-maxpro

# Run with coverage
npm run test:coverage -- --testPathPattern=claude-4-maxpro

# Run specific test suites
npm test -- --testNamePattern="Max Pro Quota Management"
npm test -- --testNamePattern="Intelligent Model Selection"
npm test -- --testNamePattern="Task Complexity Classification"
```

**What it tests**:
- ✅ Quota initialization (20/80 split)
- ✅ Quota tracking and reset cycles
- ✅ Intelligent model selection logic
- ✅ Task complexity classification
- ✅ Claude 4 enhanced capabilities
- ✅ Error handling and fallbacks
- ✅ Performance metrics calculation

### 2. Manual Integration Testing

**Prerequisites**:
```bash
# Ensure you have claude-code installed and authenticated
claude auth login

# Verify your oauth session exists
ls ~/.claude/.credentials.json

# Install dependencies
npm install

# Build the project
npm run build
```

#### Test 1: Basic Configuration Load

```bash
# Create test config file
cat > test-config.json << EOF
{
  "providers": {
    "anthropic": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514"
    }
  },
  "defaultProvider": "anthropic"
}
EOF

# Test loading the configuration
node -e "
import('./dist/examples/claude-4-maxpro-config.js')
  .then(() => console.log('✅ Configuration loaded successfully'))
  .catch(err => console.error('❌ Configuration failed:', err.message))
"
```

#### Test 2: Quota Management Simulation

```typescript
// Create: tests/manual/quota-simulation.ts
import { ProviderManager } from '../../src/providers/provider-manager.js';
import { Logger } from '../../src/core/logger.js';
import { ConfigManager } from '../../src/config/config-manager.js';

async function testQuotaManagement() {
  const logger = new Logger('QuotaTest');
  const configManager = ConfigManager.getInstance();
  await configManager.init();
  
  const config = {
    providers: {
      anthropic: {
        provider: 'anthropic' as const,
        model: 'claude-sonnet-4-20250514' as const,
      },
    },
    defaultProvider: 'anthropic' as const,
  };
  
  const manager = new ProviderManager(logger, configManager, config);
  
  // Initialize quota
  manager.initializeMaxProQuota(1000);
  const quota = manager.getMaxProQuota()!;
  
  console.log('Initial Quota:', {
    opus: `${quota.opusQuotaUsed}/${quota.opusQuotaLimit}`,
    sonnet: `${quota.sonnetQuotaUsed}/${quota.sonnetQuotaLimit}`,
  });
  
  // Test different request types
  const requests = [
    'Analyze strategic architecture implications',
    'Write a simple function',
    'Debug this error message',
    'Comprehensive system design review',
  ];
  
  for (const content of requests) {
    const request = {
      messages: [{ role: 'user' as const, content }],
      model: 'claude-sonnet-4-20250514' as const,
      quotaConstraints: { maxProPlan: quota },
    };
    
    const optimization = await manager.getMaxProOptimization(request);
    console.log(`\nRequest: "${content.substring(0, 30)}..."`);
    console.log(`Recommended: ${optimization?.recommendedModel}`);
    console.log(`Reasoning: ${optimization?.reasoning}`);
  }
  
  manager.destroy();
}

testQuotaManagement().catch(console.error);
```

```bash
# Run quota simulation
npx tsx tests/manual/quota-simulation.ts
```

#### Test 3: Model Selection Logic

```bash
# Test strategic task detection
node -e "
import { classifyTaskComplexity } from './dist/examples/claude-4-maxpro-config.js';

const testCases = [
  'strategic architecture comprehensive analysis',
  'implement feature with testing', 
  'what is 2 + 2?',
  'A very long complex task...'
];

testCases.forEach(content => {
  const complexity = classifyTaskComplexity([{role: 'user', content}]);
  console.log(\`\\\"\${content}\\\" -> \${complexity}\`);
});
"
```

### 3. Live API Testing (Optional - Uses Real Quota)

⚠️ **Warning**: These tests use actual Claude API quota. Only run if you want to test with real API calls.

#### Test 4: Real API Integration

```typescript
// Create: tests/manual/live-api-test.ts
import { ProviderManager } from '../../src/providers/provider-manager.js';
import { AnthropicProvider } from '../../src/providers/anthropic-provider.js';

async function testLiveAPI() {
  console.log('⚠️  This test uses real API quota!');
  console.log('🔄 Testing Claude 4 model availability...');
  
  try {
    const provider = new AnthropicProvider({
      logger: new Logger('LiveTest'),
      config: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      },
    });
    
    await provider.initialize();
    
    // Test model listing
    const models = await provider.listModels();
    console.log('Available models:', models);
    
    // Test Claude 4 model info
    const modelInfo = await provider.getModelInfo('claude-sonnet-4-20250514');
    console.log('Claude 4 Sonnet info:', {
      maxOutputTokens: modelInfo.maxOutputTokens,
      supportedFeatures: modelInfo.supportedFeatures,
    });
    
    provider.destroy();
    console.log('✅ Live API test completed');
    
  } catch (error) {
    console.error('❌ Live API test failed:', error.message);
    
    if (error.message.includes('model not found')) {
      console.log('ℹ️  Claude 4 models may not be available yet');
    }
    
    if (error.message.includes('authentication')) {
      console.log('ℹ️  Check your claude auth: claude auth login');
    }
  }
}

testLiveAPI();
```

```bash
# Run live API test (uses real quota)
npx tsx tests/manual/live-api-test.ts
```

### 4. Local Model Testing

#### Test 5: Ollama Integration

```bash
# Ensure your local model is running
curl -s http://localhost:8080/v1/models | jq '.data[].id'

# Test local model integration
cat > tests/manual/local-model-test.js << 'EOF'
import { OllamaProvider } from '../../dist/src/providers/ollama-provider.js';
import { Logger } from '../../dist/src/core/logger.js';

async function testLocalModel() {
  console.log('🤖 Testing local Qwen2 model...');
  
  try {
    const provider = new OllamaProvider({
      logger: new Logger('LocalTest'),
      config: {
        provider: 'ollama',
        model: 'qwen2-7b-instruct',
        apiUrl: 'http://localhost:8080',
      },
    });
    
    await provider.initialize();
    
    const healthCheck = await provider.healthCheck();
    console.log('Health check:', healthCheck);
    
    if (healthCheck.healthy) {
      console.log('✅ Local model is available for fallback');
    } else {
      console.log('❌ Local model health check failed');
    }
    
    provider.destroy();
    
  } catch (error) {
    console.error('❌ Local model test failed:', error.message);
    console.log('ℹ️  Make sure your llama.cpp server is running on port 8080');
  }
}

testLocalModel();
EOF

node tests/manual/local-model-test.js
```

### 5. Performance Testing

#### Test 6: Quota Dashboard

```bash
# Generate quota dashboard
node -e "
import { generateQuotaDashboard } from './dist/examples/claude-4-maxpro-config.js';

const quota = {
  quotaReset: new Date(Date.now() + 3.5 * 60 * 60 * 1000),
  opusQuotaUsed: 45,
  sonnetQuotaUsed: 123,
  opusQuotaLimit: 200,
  sonnetQuotaLimit: 800,
  totalQuotaLimit: 1000,
  currentCycleStart: new Date(Date.now() - 1.5 * 60 * 60 * 1000),
};

console.log(generateQuotaDashboard(quota));
"
```

#### Test 7: Stress Test Quota Logic

```typescript
// Create: tests/manual/stress-test.ts
import { ProviderManager } from '../../src/providers/provider-manager.js';

async function stressTestQuota() {
  const manager = new ProviderManager(/* config */);
  manager.initializeMaxProQuota(100); // Small quota for testing
  
  console.log('🔥 Stress testing quota management...');
  
  // Simulate 150 requests (more than quota)
  for (let i = 0; i < 150; i++) {
    const request = {
      messages: [{ 
        role: 'user' as const, 
        content: i % 3 === 0 ? 'strategic analysis task' : 'simple question' 
      }],
      model: 'claude-sonnet-4-20250514' as const,
      quotaConstraints: { maxProPlan: manager.getMaxProQuota()! },
    };
    
    const optimization = await manager.getMaxProOptimization(request);
    
    if (i % 20 === 0) {
      console.log(`Request ${i}: ${optimization?.recommendedModel}`);
    }
    
    // Simulate quota usage
    if (optimization?.recommendedModel.includes('claude-4')) {
      const quota = manager.getMaxProQuota()!;
      if (optimization.recommendedModel.includes('opus')) {
        quota.opusQuotaUsed++;
      } else {
        quota.sonnetQuotaUsed++;
      }
    }
  }
  
  const final = manager.getMaxProQuota()!;
  console.log('Final quota state:', {
    opus: `${final.opusQuotaUsed}/${final.opusQuotaLimit}`,
    sonnet: `${final.sonnetQuotaUsed}/${final.sonnetQuotaLimit}`,
  });
  
  manager.destroy();
}

stressTestQuota();
```

### 6. End-to-End Testing

#### Test 8: Complete Workflow

```bash
# Create comprehensive test script
cat > test-complete-workflow.sh << 'EOF'
#!/bin/bash

echo "🧪 Claude 4 Max Pro Complete Workflow Test"
echo "=========================================="

# 1. Check prerequisites
echo "1. Checking prerequisites..."
if ! command -v claude &> /dev/null; then
    echo "❌ claude-code not installed"
    exit 1
fi

if [ ! -f ~/.claude/.credentials.json ]; then
    echo "❌ Claude authentication not found. Run: claude auth login"
    exit 1
fi

if ! curl -s http://localhost:8080/v1/models > /dev/null; then
    echo "⚠️  Local model not available (optional)"
else
    echo "✅ Local model available"
fi

# 2. Build project
echo "2. Building project..."
npm run build || exit 1

# 3. Run unit tests
echo "3. Running unit tests..."
npm test -- --testPathPattern=claude-4-maxpro || exit 1

# 4. Test configuration
echo "4. Testing configuration..."
node -e "
import('./dist/examples/claude-4-maxpro-config.js')
  .then(() => console.log('✅ Configuration test passed'))
  .catch(err => { console.error('❌ Configuration test failed:', err.message); process.exit(1); })
"

# 5. Test quota simulation
echo "5. Running quota simulation..."
npx tsx tests/manual/quota-simulation.ts || exit 1

echo ""
echo "🎉 All tests passed! Claude 4 Max Pro upgrade is ready."
echo ""
echo "Next steps:"
echo "- Run live API test (optional): npx tsx tests/manual/live-api-test.ts"
echo "- Use the configuration: import './examples/claude-4-maxpro-config.js'"
echo "- Monitor quota usage with the dashboard"
EOF

chmod +x test-complete-workflow.sh
./test-complete-workflow.sh
```

## 🚨 Testing Checklist

### Before Testing
- [ ] claude-code installed and authenticated
- [ ] OAuth session exists (`~/.claude/.credentials.json`)
- [ ] Local model running (optional, for fallback testing)
- [ ] Dependencies installed (`npm install`)
- [ ] Project built (`npm run build`)

### Unit Testing
- [ ] All integration tests pass
- [ ] Quota management logic works
- [ ] Model selection is intelligent
- [ ] Task complexity classification is accurate
- [ ] Error handling is robust

### Manual Testing  
- [ ] Configuration loads without errors
- [ ] Quota simulation runs correctly
- [ ] Model selection responds to task complexity
- [ ] Local model fallback works (if available)
- [ ] Performance metrics are accurate

### Optional Live Testing
- [ ] Real API calls work with Claude 4 models
- [ ] Quota tracking updates correctly
- [ ] Rate limiting triggers fallbacks
- [ ] Authentication works seamlessly

### Performance Testing
- [ ] Quota dashboard generates correctly
- [ ] Stress testing handles edge cases
- [ ] Memory usage is reasonable
- [ ] Response times are acceptable

## 🐛 Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| `Model not found: claude-opus-4-20250514` | Claude 4 models may not be available yet. Fallback to Claude 3 works automatically |
| `Authentication failed` | Run `claude auth login` to refresh OAuth session |
| `Local model connection failed` | Start llama.cpp server: `./server -m model.gguf --port 8080` |
| `Tests fail with import errors` | Run `npm run build` before testing |
| `Quota tracking not working` | Check that `MaxProQuotaInfo` is properly initialized |

## 📊 Expected Test Results

**Unit Tests**: All should pass ✅  
**Quota Management**: 20/80 split correctly implemented ✅  
**Model Selection**: Strategic tasks → Opus, General → Sonnet ✅  
**Fallback System**: Local model used when quota exhausted ✅  
**Performance**: Sub-100ms for optimization decisions ✅  

The testing framework validates that the Claude 4 Max Pro upgrade works correctly, efficiently manages quota, and provides intelligent fallbacks while maintaining backward compatibility.