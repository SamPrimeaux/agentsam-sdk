import http from 'http';
import path from 'path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { createCadApp } from './app';

dotenv.config();

const PORT = 3000;
const app = createCadApp();
const server = http.createServer(app);

// ----------------------------------------------------
// WEBSOCKET REAL-TIME MULTIPLAYER COLLABORATION
// ----------------------------------------------------
const wss = new WebSocketServer({ server });

interface ClientSession {
  ws: WebSocket;
  roomId: string;
  user: {
    id: string;
    name: string;
    color: string;
    role: 'Owner' | 'Editor' | 'Viewer';
  };
}

const clients = new Map<WebSocket, ClientSession>();

wss.on('connection', (ws) => {
  ws.on('message', (messageRaw: string) => {
    try {
      const data = JSON.parse(messageRaw.toString());
      const { type, roomId, user, project, cursor, targetUserId, newRole } = data;

      if (type === 'join_room') {
        const existingInRoom = Array.from(clients.values()).filter((c) => c.roomId === roomId);
        const hasOwner = existingInRoom.some((c) => c.user.role === 'Owner');
        const assignedRole: 'Owner' | 'Editor' | 'Viewer' = !hasOwner ? 'Owner' : user?.role || 'Editor';

        const sessionUser = {
          id: user?.id || `user_${Date.now()}`,
          name: user?.name || 'Architect',
          color: user?.color || '#3b82f6',
          role: assignedRole,
        };

        clients.set(ws, { ws, roomId, user: sessionUser });

        broadcastToRoom(roomId, ws, {
          type: 'user_joined',
          user: sessionUser,
        });

        const roomUsers = Array.from(clients.values())
          .filter((c) => c.roomId === roomId)
          .map((c) => c.user);

        ws.send(
          JSON.stringify({
            type: 'room_users',
            users: roomUsers,
            yourRole: assignedRole,
          })
        );
      }

      if (type === 'change_role') {
        const session = clients.get(ws);
        if (session && session.user.role === 'Owner') {
          let changed = false;
          for (const targetSession of clients.values()) {
            if (targetSession.roomId === session.roomId && targetSession.user.id === targetUserId) {
              targetSession.user.role = newRole;
              changed = true;
              if (targetSession.ws.readyState === WebSocket.OPEN) {
                targetSession.ws.send(
                  JSON.stringify({
                    type: 'role_updated',
                    role: newRole,
                    updatedBy: session.user.name,
                  })
                );
              }
              break;
            }
          }

          if (changed) {
            const roomUsers = Array.from(clients.values())
              .filter((c) => c.roomId === session.roomId)
              .map((c) => c.user);
            broadcastToRoom(session.roomId, null, {
              type: 'room_users',
              users: roomUsers,
            });
          }
        } else if (session && session.user.role !== 'Owner') {
          ws.send(
            JSON.stringify({
              type: 'permission_denied',
              action: 'change_role',
              message: 'Only the room Owner can manage user roles and permissions.',
            })
          );
        }
      }

      if (type === 'project_update') {
        const session = clients.get(ws);
        if (session) {
          if (session.user.role === 'Viewer') {
            ws.send(
              JSON.stringify({
                type: 'permission_denied',
                action: 'project_update',
                message: 'Viewers have read-only access. You cannot modify the design.',
              })
            );
            return;
          }

          broadcastToRoom(session.roomId, ws, {
            type: 'project_update',
            project,
            senderId: session.user.id,
          });
        }
      }

      if (type === 'cursor_move') {
        const session = clients.get(ws);
        if (session) {
          broadcastToRoom(session.roomId, ws, {
            type: 'cursor_move',
            userId: session.user.id,
            ...cursor,
          });
        }
      }
    } catch (e) {
      console.error('WebSocket message parsing error:', e);
    }
  });

  ws.on('close', () => {
    const session = clients.get(ws);
    if (session) {
      const { roomId, user } = session;
      clients.delete(ws);

      const remainingInRoom = Array.from(clients.values()).filter((c) => c.roomId === roomId);
      if (user.role === 'Owner' && remainingInRoom.length > 0) {
        remainingInRoom[0].user.role = 'Owner';
        if (remainingInRoom[0].ws.readyState === WebSocket.OPEN) {
          remainingInRoom[0].ws.send(
            JSON.stringify({
              type: 'role_updated',
              role: 'Owner',
              message: 'You have been promoted to Owner as the previous host disconnected.',
            })
          );
        }
      }

      broadcastToRoom(roomId, ws, {
        type: 'user_left',
        userId: user.id,
      });

      const updatedUsers = remainingInRoom.map((c) => c.user);
      broadcastToRoom(roomId, null, {
        type: 'room_users',
        users: updatedUsers,
      });
    }
  });
});

function broadcastToRoom(roomId: string, senderWs: WebSocket | null, payload: any) {
  const json = JSON.stringify(payload);
  clients.forEach((session, ws) => {
    if (session.roomId === roomId && ws !== senderWs && ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  });
}

// ----------------------------------------------------
// START SERVER WITH VITE MIDDLEWARE
// ----------------------------------------------------
export async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AgentSam CAD Studio server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
