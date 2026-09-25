const dgram = require('dgram');
const crypto = require('crypto');

/**
 * Default network configurations for UDP Server & Client.
 */
const DEFAULT_UDP_HOST = '127.0.0.1';
const DEFAULT_UDP_PORT = 41234;
const DEFAULT_UDP_CREDENTIALS = 'default-secret-key';

/**
 * Creates and starts a UDP Server (UB) instance for HTTP-to-UDP processing.
 * Choice A Signature: (options, processingFunction, defaultUdpAuthenticate)
 *
 * @param {Object} [options={}] - Configuration parameters.
 * @param {string} [options.host='127.0.0.1'] - UDP host address.
 * @param {number} [options.port=41234] - UDP port number.
 * @param {string} [options.credentials='default-secret-key'] - Configured credential token.
 * @param {Function} processingFunction - Custom handler: `async ({ url, method, headers, body }) => ({ status, headers, body })`.
 * @param {Function} defaultUdpAuthenticate - Custom authenticator: `async (incomingCreds, configuredCreds) => boolean`.
 * @returns {dgram.Socket} Bound UDP socket instance.
 */
function createUdpServer(options = {}, processingFunction, defaultUdpAuthenticate) {
  const host = options.host || DEFAULT_UDP_HOST;
  const port = options.port || DEFAULT_UDP_PORT;
  const credentials = options.credentials || DEFAULT_UDP_CREDENTIALS;

  const authenticate = defaultUdpAuthenticate;

  const server = dgram.createSocket('udp4');

  server.on('message', async (msg, rinfo) => {
    let responsePayload = {};
    let correlationId = null;

    try {
      const parsedData = JSON.parse(msg.toString('utf-8'));
      correlationId = parsedData.correlationId;

      // Validate UDP credentials
      let isAuthenticated = false;
      if (typeof authenticate === 'function') {
        isAuthenticated = await authenticate(parsedData.credentials, credentials);
      } else {
        isAuthenticated = (parsedData.credentials === credentials);
      }

      if (!isAuthenticated) {
        responsePayload = {
          correlationId,
          status: 401,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ error: 'Unauthorized: UDP Credentials validation failed' })
        };
      } else if (typeof processingFunction === 'function') {
        const result = await processingFunction({
          url: parsedData.url,
          method: parsedData.method,
          headers: parsedData.headers,
          body: parsedData.body
        });

        responsePayload = {
          correlationId,
          status: result.status || 200,
          headers: result.headers || { 'content-type': 'text/plain' },
          body: result.body || ''
        };
      } else {
        responsePayload = {
          correlationId,
          status: 500,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ error: 'No processing function provided on UDP server' })
        };
      }
    } catch (err) {
      responsePayload = {
        correlationId,
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Malformed UDP payload', details: err.message })
      };
    }

    const responseBuffer = Buffer.from(JSON.stringify(responsePayload));
    server.send(responseBuffer, rinfo.port, rinfo.address, (err) => {
      if (err) {
        console.error('[UDP Server (UB) HU] Error transmitting datagram:', err);
      }
    });
  });

  server.on('error', (err) => {
    console.error('[UDP Server (UB) HU] Socket error:', err);
  });

  server.bind(port, host, () => {
    console.log(`[UDP Server (UB) HU] Listening on ${host}:${port}`);
  });

  return server;
}

/**
 * Creates a UDP Client instance for dispatching payloads to UDP Server UB.
 *
 * @param {Object} [options={}] - Options.
 * @param {string} [options.host='127.0.0.1'] - Destination UDP Host.
 * @param {number} [options.port=41234] - Destination UDP Port.
 * @param {string} [options.credentials='default-secret-key'] - Secret credentials header.
 * @returns {Object} `{ sendHttpRequestPayload, close }`
 */
function createUdpClient(options = {}) {
  const targetHost = options.host || DEFAULT_UDP_HOST;
  const targetPort = options.port || DEFAULT_UDP_PORT;
  const credentials = options.credentials || DEFAULT_UDP_CREDENTIALS;

  const socket = dgram.createSocket('udp4');
  const pendingRequests = new Map();

  socket.on('message', (msg) => {
    try {
      const responseData = JSON.parse(msg.toString('utf-8'));
      const { correlationId, status, headers, body } = responseData;

      if (correlationId && pendingRequests.has(correlationId)) {
        const { resolve, timer } = pendingRequests.get(correlationId);
        clearTimeout(timer);
        pendingRequests.delete(correlationId);
        resolve({ status, headers, body });
      }
    } catch (err) {
      console.error('[UDP Client (UA)] Response decoding error:', err);
    }
  });

  socket.on('error', (err) => {
    console.error('[UDP Client (UA)] Socket error:', err);
  });

  return {
    sendHttpRequestPayload: function (httpRequestDetails, timeoutMs = 5000) {
      return new Promise((resolve, reject) => {
        const correlationId = crypto.randomUUID();

        const payload = {
          correlationId,
          credentials,
          url: httpRequestDetails.url,
          method: httpRequestDetails.method,
          headers: httpRequestDetails.headers,
          body: httpRequestDetails.body
        };

        const messageBuffer = Buffer.from(JSON.stringify(payload));

        const timer = setTimeout(() => {
          if (pendingRequests.has(correlationId)) {
            pendingRequests.delete(correlationId);
            reject(new Error('UDP Request Timeout: No response received from UDP Server'));
          }
        }, timeoutMs);

        pendingRequests.set(correlationId, { resolve, reject, timer });

        socket.send(messageBuffer, targetPort, targetHost, (err) => {
          if (err) {
            clearTimeout(timer);
            pendingRequests.delete(correlationId);
            reject(err);
          }
        });
      });
    },

    close: function () {
      socket.close();
    }
  };
}

module.exports = {
  createUdpServer,
  createUdpClient
};