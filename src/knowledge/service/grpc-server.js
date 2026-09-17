import { createBearerTokenVerifier } from './auth.js';
import { serviceError } from './job-engine.js';
import {
  grpc,
  KnowledgeServiceService,
  authorizationFromMetadata,
  decodeJobId,
  decodeSubmitRequest,
  encodeJob,
  encodeJobEvent,
  encodeRepositoryList,
  isTerminalJob,
  toGrpcError,
} from './grpc-codec.js';

export async function startKnowledgeGrpcServer({
  engine,
  token,
  verifyToken,
  port = 0,
  host = '127.0.0.1',
  credentials = grpc.ServerCredentials.createInsecure(),
} = {}) {
  if (!engine) throw new Error('Knowledge job engine is required.');
  const verify = verifyToken || createBearerTokenVerifier(token);
  const authenticate = call => {
    if (!verify(authorizationFromMetadata(call.metadata))) throw serviceError(401, 'Unauthorized.', 'UNAUTHENTICATED');
  };
  const unary = handler => (call, callback) => {
    try {
      authenticate(call);
      callback(null, handler(call));
    } catch (error) {
      callback(toGrpcError(error));
    }
  };

  const server = new grpc.Server();
  server.addService(KnowledgeServiceService, {
    listRepositories: unary(() => encodeRepositoryList(engine.listRepositories())),
    submitJob: unary(call => {
      const { body, idempotencyKey } = decodeSubmitRequest(call.request);
      return encodeJob(engine.submitJob(body, { idempotencyKey }).job);
    }),
    getJob: unary(call => encodeJob(engine.getJob(decodeJobId(call.request)))),
    watchJob(call) {
      let unsubscribe = () => {};
      let ended = false;
      try {
        authenticate(call);
        let sequence = 0;
        unsubscribe = engine.watchJob(decodeJobId(call.request), job => {
          if (ended || call.cancelled) return;
          call.write(encodeJobEvent(job, ++sequence));
          if (isTerminalJob(job)) {
            ended = true;
            queueMicrotask(() => {
              unsubscribe();
              if (!call.cancelled) call.end();
            });
          }
        });
        call.once('cancelled', () => { ended = true; unsubscribe(); });
        call.once('close', () => { ended = true; unsubscribe(); });
      } catch (error) {
        ended = true;
        unsubscribe();
        call.emit('error', toGrpcError(error));
      }
    },
  });

  const boundPort = await new Promise((resolve, reject) => {
    server.bindAsync(`${host}:${port}`, credentials, (error, actualPort) => error ? reject(error) : resolve(actualPort));
  });
  server.start();
  return {
    server,
    address: { host, port: boundPort },
    target: `${host}:${boundPort}`,
    async close() { await new Promise(resolve => server.tryShutdown(resolve)); },
    forceClose() { server.forceShutdown(); },
  };
}
