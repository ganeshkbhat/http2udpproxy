const { createUdpServer } = require('./hudp');

const UDP_BACKEND_PORT = 8013;
const SHARED_CREDENTIALS = 'udp-secret-token';

// 1. Define UDP Backend Request Handler
const udpRequestHandler = async (reqPayload) => {
  console.log(`[UDP Backend Target] Received Request: ${reqPayload.method} ${reqPayload.url}`);
  console.log('[UDP Backend Target] Payload Received:', reqPayload.body);

  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      status: 'success',
      message: 'Hello from UDP Target Backend Service',
      path: reqPayload.url,
      method: reqPayload.method,
      receivedData: reqPayload.body,
      processedAt: new Date().toISOString()
    })
  };
};

// 2. Define Authentication Validator
const authValidator = async (incomingToken, configuredCreds) => {
  return incomingToken === configuredCreds;
};

// 3. Start Standalone UDP Backend Server
const udpBackendServer = createUdpServer(
  {
    port: UDP_BACKEND_PORT,
    credentials: SHARED_CREDENTIALS
  },
  udpRequestHandler,
  authValidator
);

console.log('================================================================');
console.log(`  UDP Target Backend Server running on port ${UDP_BACKEND_PORT}`);
console.log('================================================================');

process.on('SIGINT', () => {
  console.log('\nShutting down UDP Target Backend Server...');
  udpBackendServer.close();
  process.exit(0);
});