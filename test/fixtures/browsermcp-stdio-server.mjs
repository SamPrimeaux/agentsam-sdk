import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Deterministic protocol fixture. It never launches Chrome, downloads packages,
// connects to a third-party service or touches the user's browser profile.
const server = new Server(
  { name: 'browsermcp-test-stdio', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'browser',
    description: 'Browser MCP protocol fixture',
    inputSchema: {
      type: 'object',
      properties: { commands: { type: 'string' } },
      required: ['commands'],
      additionalProperties: false,
    },
  }],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => ({
  content: [{
    type: 'text',
    text: 'fixture:' + String(request.params.arguments?.commands || ''),
  }],
}));

await server.connect(new StdioServerTransport());
