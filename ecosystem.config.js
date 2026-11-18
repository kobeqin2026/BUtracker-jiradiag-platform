var fs = require('fs');
var path = require('path');

// Load environment variables from skills/.env if exists
var envFile = path.join(process.env.HOME, 'skills', '.env');
if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8').split('\n').forEach(function(line) {
        line = line.trim();
        if (line && !line.startsWith('#') && line.indexOf('=') !== -1) {
            var idx = line.indexOf('=');
            var key = line.substring(0, idx).trim();
            var val = line.substring(idx + 1).trim();
            if (!process.env[key]) process.env[key] = val;
        }
    });
}

module.exports = {
  apps: [{
    name: 'gpu-tracker',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      JIRA_BASE_URL: process.env.JIRA_BASE_URL || 'https://jira.example.com',
      JIRA_PAT: process.env.JIRA_PAT || '',
      BAILIAN_API_KEY: process.env.BAILIAN_API_KEY || '',
      BAILIAN_BASE_URL: process.env.BAILIAN_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1',
      BAILIAN_MODEL: process.env.GPU_TRACKER_LLM_MODEL || process.env.BAILIAN_MODEL || 'minimax-m2.5',
      DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY || '',
      // 图片分析总开关。2026-11-03 实测：网关上的 qwen-vl 实际路由到纯文本模型
      // Qwen3.6-27B，任何图片都返回空内容，只能等到超时 —— 智能诊断的白等时间
      // 全部来自这里（3 张图并行 × 超时）。接入真正可用的视觉模型后：
      // 设 VLM_ENABLED=true + VLM_MODEL/VLM_BASE_URL/VLM_API_KEY 指向该模型即可恢复。
      VLM_ENABLED: process.env.VLM_ENABLED || 'false',
      VLM_TIMEOUT_MS: process.env.VLM_TIMEOUT_MS || '20000',
      DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || '',
      DEFAULT_USER_PASSWORD: process.env.DEFAULT_USER_PASSWORD || ''
    }
  }]
};
