export function encodeGrpcFrame(message) {
  const payload = Buffer.from(message || []);
  const header = Buffer.allocUnsafe(5);
  header[0] = 0;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

export class GrpcFrameDecoder {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    if (chunk?.length) this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    const messages = [];
    while (this.buffer.length >= 5) {
      const compressed = this.buffer[0];
      if (compressed !== 0) throw new Error('compressed gRPC messages are not supported');
      const length = this.buffer.readUInt32BE(1);
      if (this.buffer.length < 5 + length) break;
      messages.push(this.buffer.subarray(5, 5 + length));
      this.buffer = this.buffer.subarray(5 + length);
    }
    return messages;
  }

  finish() {
    if (this.buffer.length) throw new Error('truncated gRPC message frame');
  }
}
