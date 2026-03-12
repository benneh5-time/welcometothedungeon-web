import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { removeConnection } from '../../db/connection-store.js';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  await removeConnection(connectionId);
  return { statusCode: 200, body: 'Disconnected' };
};
