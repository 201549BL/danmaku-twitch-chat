function DANMAKU_GPU_MEDIA_FACTORY(root) {
  'use strict';
  const MAX_BYTES = 8 * 1024 * 1024;
  const MAX_PIXELS = 4 * 1024 * 1024;
  const MAX_DECODE_PIXELS = 32 * 1024 * 1024;
  const MAX_FRAMES = 300;

  function failure(message) { return new Error(`GPU media: ${message}`); }
  function aborted() { return new DOMException('Media loading aborted', 'AbortError'); }
  function typeOf(bytes) {
    const ascii = (offset, count) => String.fromCharCode(...bytes.subarray(offset, offset + count));
    if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
    if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
    throw failure('unsupported image signature');
  }

  async function readBytes(response, check) {
    if (!response.ok || response.type === 'opaque') throw failure('image is not CORS-accessible');
    if (Number(response.headers.get('content-length')) > MAX_BYTES) throw failure('image exceeds byte budget');
    if (!response.body) throw failure('image response has no readable body');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        check();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw failure('image exceeds byte budget');
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }

  async function open(url, { signal } = {}) {
    let decoder;
    let closed = false;
    let width = 0;
    let height = 0;
    const cache = new Map();
    const close = () => {
      if (closed) return;
      closed = true;
      signal?.removeEventListener('abort', close);
      for (const frame of cache.values()) frame.close();
      cache.clear();
      decoder?.close();
    };
    const check = () => { if (closed || signal?.aborted) throw aborted(); };
    signal?.addEventListener('abort', close, { once: true });
    try {
      check();
      if (!root.ImageDecoder) throw failure('ImageDecoder is unavailable');
      const response = await root.fetch(url, { mode: 'cors', credentials: 'omit', signal });
      check();
      const bytes = await readBytes(response, check);
      const type = typeOf(bytes);
      if (!await root.ImageDecoder.isTypeSupported(type)) throw failure(`unsupported decoder ${type}`);
      check();
      decoder = new root.ImageDecoder({ data: bytes, type, preferAnimation: true });
      await decoder.tracks.ready;
      check();
      const track = decoder.tracks.selectedTrack;
      if (!track || !Number.isInteger(track.frameCount) || track.frameCount < 1 || track.frameCount > MAX_FRAMES) throw failure('invalid or excessive frame count');
      const count = track.frameCount;
      const repetitions = track.repetitionCount;
      if (count > 1 && repetitions !== Infinity && (!Number.isInteger(repetitions) || repetitions < 0)) throw failure('unknown animation repetition count');
      const ends = [];
      let duration = 0;

      async function decode(index) {
        check();
        const result = await decoder.decode({ frameIndex: index, completeFramesOnly: true });
        const frame = result.image;
        try {
          check();
          if (!result.complete || !frame) throw failure('incomplete image frame');
          const w = frame.displayWidth;
          const h = frame.displayHeight;
          if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 4096 || h > 4096 || w * h > MAX_PIXELS || w * h * count > MAX_DECODE_PIXELS) throw failure('image exceeds decoded pixel budget');
          if (width && (width !== w || height !== h)) throw failure('decoder did not return composited frames');
          width = w; height = h;
          return frame;
        } catch (error) { frame?.close(); throw error; }
      }

      for (let index = 0; index < count; index++) {
        const frame = await decode(index);
        if (closed || signal?.aborted) { frame.close(); throw aborted(); }
        if (count > 1 && (!Number.isFinite(frame.duration) || frame.duration < 0)) {
          frame.close();
          throw failure('unknown animation frame duration');
        }
        // Chromium's HTML images display frames of 10ms or less for 100ms.
        if (count > 1) duration += frame.duration <= 10000 ? 100 : frame.duration / 1000;
        ends.push(duration);
        if (index < 2) cache.set(index, frame);
        else frame.close();
      }
      let pending = Promise.resolve();
      async function select(elapsedMs) {
        check();
        if (!Number.isFinite(elapsedMs)) throw failure('invalid animation clock');
        let index = 0;
        if (count > 1) {
          const elapsed = Math.max(0, elapsedMs);
          if (repetitions !== Infinity && elapsed >= duration * (repetitions + 1)) index = count - 1;
          else {
            const time = elapsed % duration;
            index = ends.findIndex(end => time < end);
          }
        }
        if (!cache.has(index)) {
          for (const [key, frame] of cache) {
            if (cache.size < 2) break;
            frame.close(); cache.delete(key);
          }
          const frame = await decode(index);
          if (closed || signal?.aborted) { frame.close(); throw aborted(); }
          cache.set(index, frame);
        }
        return cache.get(index);
      }
      return {
        width, height, byteLength: bytes.byteLength,
        frame(elapsedMs) {
          const next = pending.then(() => select(elapsedMs)).catch(error => { close(); throw error; });
          pending = next.catch(() => {});
          return next;
        },
        close,
      };
    } catch (error) { close(); throw error; }
  }
  return Object.freeze({ open });
}
globalThis.DANMAKU_GPU_MEDIA = DANMAKU_GPU_MEDIA_FACTORY(globalThis);
