const { createUdpClient } = require('./hudp');
const { createHttpServer, sendHttpRequest } = require('./httpm');

const UDP_BACKEND_PORT = 8013;
const HTTP_PROXY_PORT = 9016;
const SHARED_CREDENTIALS = 'udp-secret-token';

async function startReverseProxyGateway() {
  console.log('================================================================');
  console.log('  HTTP Reverse Proxy Gateway Server (Forwarding to UDP Backend)');
  console.log('================================================================\n');

  // 1. Initialize UDP Client connected to the UDP Backend Target
  const udpProxyClient = createUdpClient({
    port: UDP_BACKEND_PORT,
    credentials: SHARED_CREDENTIALS
  });

  // 2. Bridge incoming HTTP requests to UDP datagrams
  const udpProxyHandler = async (httpRequestDetails) => {
    console.log(`[Reverse Proxy] Forwarding ${httpRequestDetails.method} ${httpRequestDetails.url} -> UDP Backend:${UDP_BACKEND_PORT}`);

    const udpResponse = await udpProxyClient.sendHttpRequestPayload(httpRequestDetails);

    return {
      protocolClient: udpProxyClient,
      response: udpResponse
    };
  };

  // 3. Start HTTP Reverse Proxy Gateway
  const httpServer = createHttpServer(
    { httpPort: HTTP_PROXY_PORT },
    udpProxyHandler
  );

  console.log(`[Reverse Proxy] Gateway active and listening on http://127.0.0.1:${HTTP_PROXY_PORT}`);

  // Wait brief duration for server bindings
  await new Promise((resolve) => setTimeout(resolve, 300));

  // 4. Test client request execution
  console.log('\n--- Initiating Client Request to Reverse Proxy Gateway ---');
  try {
    const response = await sendHttpRequest({
      targetUrl: `http://127.0.0.1:${HTTP_PROXY_PORT}/api/v1/telemetry`,
      method: 'POST',
      body: {
        sensorId: 'udp-node-104',
        metric: 'packet_count',
        value: 1250
      }
    });

    console.log('[HTTP Client] Proxy Response Status Code:', response.statusCode);
    console.log('[HTTP Client] Proxy Response Body:', JSON.stringify(response.body, null, 2));
  } catch (err) {
    console.error('[HTTP Client] Reverse Proxy Request Failed:', err.message);
  }

  process.on('SIGINT', () => {
    console.log('\nShutting down HTTP Reverse Proxy Gateway...');
    httpServer.server.close();
    udpProxyClient.close();
    process.exit(0);
  });
}

startReverseProxyGateway();