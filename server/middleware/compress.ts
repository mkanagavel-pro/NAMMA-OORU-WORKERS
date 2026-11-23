import zlib from 'zlib';
import type { Request, Response, NextFunction } from 'express';

/**
 * Minimal gzip/brotli response compression (no extra dependency). Compresses text-like responses of at least 1 KB
 * when the client accepts it. Sets Vary: Accept-Encoding. Skips already-encoded, ranged and HEAD responses.
 */
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|manifest\+json)|image\/svg\+xml)/i;

export function compression() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'HEAD') return next();
    const accept = String(req.headers['accept-encoding'] || '');
    const enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
    if (!enc) return next();

    const origWrite = res.write.bind(res) as (...a: any[]) => boolean;
    const origEnd = res.end.bind(res) as (...a: any[]) => Response;
    let stream: zlib.BrotliCompress | zlib.Gzip | null = null;
    let decided = false;

    const decide = (sizeHint = 0) => {
      decided = true;
      const type = String(res.getHeader('Content-Type') || '');
      const len = Number(res.getHeader('Content-Length') || 0);
      const ok = COMPRESSIBLE.test(type) && !res.getHeader('Content-Encoding') && res.statusCode !== 204 && res.statusCode !== 304 && !res.getHeader('Content-Range') && (len >= 1024 || (len === 0 && (sizeHint === 0 || sizeHint >= 1024)));
      res.vary('Accept-Encoding');
      if (!ok) return;
      stream = enc === 'br'
        ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } })
        : zlib.createGzip({ level: 6 });
      res.setHeader('Content-Encoding', enc);
      res.removeHeader('Content-Length');
      stream.on('data', (c: Buffer) => origWrite(c));
      stream.on('end', () => origEnd());
    };

    res.write = ((chunk: any, ...rest: any[]) => {
      if (!decided) decide();
      return stream ? stream.write(chunk, ...(rest as [any])) : origWrite(chunk, ...rest);
    }) as typeof res.write;
    res.end = ((chunk?: any, ...rest: any[]) => {
      if (!decided) decide(chunk ? Buffer.byteLength(chunk) : 0);
      if (!stream) return origEnd(chunk, ...rest);
      if (chunk) stream.write(chunk, ...(rest.filter((r) => typeof r === 'string') as [any]));
      stream.end();
      return res;
    }) as typeof res.end;
    next();
  };
}
