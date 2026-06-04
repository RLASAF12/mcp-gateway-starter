import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const BEARER_TOKEN = process.env.BEARER_TOKEN;

// Types for JSON-RPC 2.0
interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id: string | number | null;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: JsonRpcError;
  id: string | number | null;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

// Types for MCP Tools
interface ToolInputSchema {
  type: 'object';
  properties: { [key: string]: { type: string; description?: string } };
  required: string[];
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
}

// Middleware
app.use(express.json());

// Bearer Token Auth Middleware
app.use((req, res, next) => {
  if (req.path === '/health') {
    return next(); // Health endpoint doesn't require auth
  }

  if (!BEARER_TOKEN) {
    console.warn('BEARER_TOKEN is not set. Authentication is disabled.');
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Bearer token required' });
  }

  const token = authHeader.split(' ')[1];
  if (token !== BEARER_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid Bearer token' });
  }

  next();
});

// In-memory Rate Limiter (100 req/min per IP)
const rateLimitMap = new Map<string, { count: number; reset: number }>();
const MAX_REQUESTS = 100;
const WINDOW_MS = 60 * 1000; // 1 minute

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  let entry = rateLimitMap.get(ip);

  if (!entry || entry.reset < now) {
    entry = { count: 1, reset: now + WINDOW_MS };
    rateLimitMap.set(ip, entry);
  } else {
    entry.count++;
  }

  if (entry.count > MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too Many Requests', message: 'Rate limit exceeded. Try again later.' });
  }

  next();
});

// GET /health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Tool Implementations
const tools: { [key: string]: (args: any) => any } = {
  ping: () => ({ pong: true, timestamp: new Date().toISOString() }),
  echo: (args: { message: string }) => ({ echo: args.message }),
  weather_stub: (args: { city: string }) => ({
    city: args.city,
    temperature_c: 22,
    condition: 'Sunny',
    humidity_pct: 60,
    source: 'stub - replace with real API',
  }),
};

const toolDefinitions: ToolDefinition[] = [
  {
    name: 'ping',
    description: 'Returns pong with timestamp',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'echo',
    description: 'Echoes back your message',
    inputSchema: { type: 'object', properties: { message: { type: 'string', description: 'Message to echo' } }, required: ['message'] },
  },
  {
    name: 'weather_stub',
    description: 'Returns stub weather data for a city',
    inputSchema: { type: 'object', properties: { city: { type: 'string', description: 'City name' } }, required: ['city'] },
  },
];

// POST /v1/mcp endpoint
app.post('/v1/mcp', async (req, res) => {
  const rpcRequest: JsonRpcRequest = req.body;

  if (rpcRequest.jsonrpc !== '2.0' || !rpcRequest.method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: rpcRequest.id || null,
      error: { code: -32600, message: 'Invalid Request' },
    } as JsonRpcResponse);
  }

  let rpcResponse: JsonRpcResponse;

  switch (rpcRequest.method) {
    case 'tools/list':
      rpcResponse = {
        jsonrpc: '2.0',
        id: rpcRequest.id,
        result: { tools: toolDefinitions },
      };
      break;

    case 'tools/call':
      const { name: toolName, arguments: toolArgs } = rpcRequest.params || {};

      if (!toolName || !tools[toolName]) {
        rpcResponse = {
          jsonrpc: '2.0',
          id: rpcRequest.id,
          error: { code: -32601, message: `Tool '${toolName}' not found` },
        };
      } else {
        try {
          const toolResult = await Promise.resolve(tools[toolName](toolArgs));
          rpcResponse = {
            jsonrpc: '2.0',
            id: rpcRequest.id,
            result: { content: [{ type: 'text', text: JSON.stringify(toolResult) }] },
          };
        } catch (error: any) {
          rpcResponse = {
            jsonrpc: '2.0',
            id: rpcRequest.id,
            error: { code: -32000, message: `Tool execution failed: ${error.message}` },
          };
        }
      }
      break;

    default:
      rpcResponse = {
        jsonrpc: '2.0',
        id: rpcRequest.id || null,
        error: { code: -32601, message: 'Method not found' },
      };
      break;
  }

  res.json(rpcResponse);
});

app.listen(PORT, () => {
  console.log(`MCP Express server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/v1/mcp`);
  if (!BEARER_TOKEN) {
    console.warn('WARNING: BEARER_TOKEN is not set in .env. Authentication is disabled.');
  }
});