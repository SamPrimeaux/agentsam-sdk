const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeVarint(input) {
  let value = BigInt(input ?? 0);
  if (value < 0n) throw new RangeError('protobuf varint must be non-negative');
  const bytes = [];
  while (value > 0x7fn) {
    bytes.push(Number((value & 0x7fn) | 0x80n));
    value >>= 7n;
  }
  bytes.push(Number(value));
  return Buffer.from(bytes);
}

function decodeVarint(buffer, offset) {
  let value = 0n;
  let shift = 0n;
  let cursor = offset;
  while (cursor < buffer.length && shift <= 63n) {
    const byte = BigInt(buffer[cursor++]);
    value |= (byte & 0x7fn) << shift;
    if ((byte & 0x80n) === 0n) return { value, offset: cursor };
    shift += 7n;
  }
  throw new Error('invalid protobuf varint');
}

function wireType(type, schemas) {
  if (type === 'string' || type === 'bytes' || schemas[type]) return 2;
  if (type === 'bool' || type === 'uint32' || type === 'int64') return 0;
  throw new Error(`unsupported protobuf field type: ${type}`);
}

function encodeScalar(type, value, schemas) {
  if (type === 'string') return Buffer.from(encoder.encode(String(value)));
  if (type === 'bytes') return Buffer.from(value);
  if (type === 'bool') return encodeVarint(value ? 1 : 0);
  if (type === 'uint32' || type === 'int64') return encodeVarint(value);
  if (schemas[type]) return encodeProtobuf(type, value, schemas);
  throw new Error(`unsupported protobuf field type: ${type}`);
}

function decodeScalar(type, wire, buffer, offset, schemas) {
  if (wire === 0) {
    const decoded = decodeVarint(buffer, offset);
    if (type === 'bool') return { value: decoded.value !== 0n, offset: decoded.offset };
    if (type === 'uint32') return { value: Number(decoded.value), offset: decoded.offset };
    if (type === 'int64') {
      const number = Number(decoded.value);
      return { value: Number.isSafeInteger(number) ? number : decoded.value.toString(), offset: decoded.offset };
    }
    return { value: decoded.value, offset: decoded.offset };
  }
  if (wire === 2) {
    const length = decodeVarint(buffer, offset);
    const size = Number(length.value);
    const start = length.offset;
    const end = start + size;
    if (end > buffer.length) throw new Error('truncated protobuf length-delimited field');
    const slice = buffer.subarray(start, end);
    if (type === 'string') return { value: decoder.decode(slice), offset: end };
    if (type === 'bytes') return { value: Buffer.from(slice), offset: end };
    if (schemas[type]) return { value: decodeProtobuf(type, slice, schemas), offset: end };
    return { value: Buffer.from(slice), offset: end };
  }
  throw new Error(`unsupported protobuf wire type: ${wire}`);
}

function skipUnknown(wire, buffer, offset) {
  if (wire === 0) return decodeVarint(buffer, offset).offset;
  if (wire === 2) {
    const length = decodeVarint(buffer, offset);
    const end = length.offset + Number(length.value);
    if (end > buffer.length) throw new Error('truncated protobuf unknown field');
    return end;
  }
  throw new Error(`unsupported protobuf unknown wire type: ${wire}`);
}

export function encodeProtobuf(typeName, input = {}, schemas) {
  const fields = schemas?.[typeName];
  if (!fields) throw new Error(`unknown protobuf message: ${typeName}`);
  const chunks = [];
  for (const field of fields) {
    const raw = input?.[field.name];
    const values = field.repeated ? (Array.isArray(raw) ? raw : []) : [raw];
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const wire = wireType(field.type, schemas);
      chunks.push(encodeVarint((field.tag << 3) | wire));
      const encoded = encodeScalar(field.type, value, schemas);
      if (wire === 2) chunks.push(encodeVarint(encoded.length));
      chunks.push(encoded);
    }
  }
  return Buffer.concat(chunks);
}

export function decodeProtobuf(typeName, input, schemas) {
  const fields = schemas?.[typeName];
  if (!fields) throw new Error(`unknown protobuf message: ${typeName}`);
  const buffer = Buffer.from(input || []);
  const byTag = new Map(fields.map((field) => [field.tag, field]));
  const out = {};
  for (const field of fields) if (field.repeated) out[field.name] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const key = decodeVarint(buffer, offset);
    offset = key.offset;
    const tag = Number(key.value >> 3n);
    const wire = Number(key.value & 7n);
    const field = byTag.get(tag);
    if (!field) {
      offset = skipUnknown(wire, buffer, offset);
      continue;
    }
    const decoded = decodeScalar(field.type, wire, buffer, offset, schemas);
    offset = decoded.offset;
    if (field.repeated) out[field.name].push(decoded.value);
    else out[field.name] = decoded.value;
  }
  return out;
}
