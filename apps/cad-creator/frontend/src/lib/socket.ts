import { MultiplayerUser, ProjectState, UserRole } from '@inneranimalmedia/agentsam-cad-shared';

export type SocketEventHandler = (data: any) => void;

class RealtimeCollaborationClient {
  private ws: WebSocket | null = null;
  private roomId: string = 'studio-main';
  private currentUser: MultiplayerUser;
  private eventListeners: Map<string, Set<SocketEventHandler>> = new Map();
  private reconnectTimer: any = null;
  private isConnected: boolean = false;

  constructor() {
    const randomId = 'user_' + Math.random().toString(36).substring(2, 7);
    const colors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6'];
    const names = ['Architect Alex', 'Designer Sam', 'Taylor Arch', 'Jordan BIM', 'Morgan Lead', 'Casey Eng'];
    const idx = Math.floor(Math.random() * names.length);

    this.currentUser = {
      id: randomId,
      name: names[idx],
      color: colors[idx % colors.length],
      role: 'Owner', // Default initial role, will sync from server upon room join
      selectedIds: [],
      activeTool: 'select',
      lastActive: Date.now(),
    };
  }

  public getCurrentUser(): MultiplayerUser {
    return this.currentUser;
  }

  public setUserName(name: string) {
    this.currentUser.name = name;
  }

  public setUserRole(role: UserRole) {
    this.currentUser.role = role;
  }

  public connect(roomId: string = 'studio-main', user?: Partial<MultiplayerUser>) {
    this.roomId = roomId;
    if (user) {
      this.currentUser = { ...this.currentUser, ...user };
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        // Send join room packet
        this.ws?.send(
          JSON.stringify({
            type: 'join_room',
            roomId: this.roomId,
            user: this.currentUser,
          })
        );
        this.emit('connected', { roomId: this.roomId });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type) {
            // If server returned your assigned role on join or role update
            if (data.type === 'room_users' && data.yourRole) {
              this.currentUser.role = data.yourRole;
            }
            if (data.type === 'role_updated' && data.role) {
              this.currentUser.role = data.role;
            }

            this.emit(
              data.type,
              data.payload !== undefined
                ? data.payload
                : data.users || data.project || data.user || data
            );
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit('disconnected', {});
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };
    } catch (err) {
      console.warn('WebSocket connection error:', err);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (!this.isConnected) {
        this.connect(this.roomId, this.currentUser);
      }
    }, 4000);
  }

  public on(event: string, handler: SocketEventHandler): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
    return () => {
      this.eventListeners.get(event)?.delete(handler);
    };
  }

  private emit(event: string, data: any) {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(data);
        } catch (err) {
          console.error(`Error in event handler for ${event}:`, err);
        }
      });
    }
  }

  public sendProjectUpdate(project: ProjectState) {
    if (this.currentUser.role === 'Viewer') {
      console.warn('Viewer cannot send project updates');
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'project_update',
          roomId: this.roomId,
          project,
        })
      );
    }
  }

  public changeUserRole(targetUserId: string, newRole: UserRole) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'change_role',
          roomId: this.roomId,
          targetUserId,
          newRole,
        })
      );
    }
  }

  public sendCursor(x: number, y: number, view: '2d' | '3d') {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'cursor_move',
          roomId: this.roomId,
          cursor: { x, y, view },
        })
      );
    }
  }

  public disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export const collaborationClient = new RealtimeCollaborationClient();
