export class AuthError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.name = 'AuthError';
    this.status = opts.status ?? 401;
    this.code = opts.code ?? 'UNAUTHORIZED';
  }
}
