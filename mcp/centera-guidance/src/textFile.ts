import fs from 'node:fs/promises';

export type ReadTextFileResult = {
  text: string;
  truncated: boolean;
  totalBytes: number;
  readBytes: number;
};

export async function readTextFile(
  absolutePath: string,
  opts?: { maxBytes?: number },
): Promise<ReadTextFileResult> {
  const maxBytesRaw = opts?.maxBytes ?? 200_000;
  const maxBytes = clampInt(maxBytesRaw, 1_000, 2_000_000);

  const stat = await fs.stat(absolutePath);
  const totalBytes = stat.size;

  if (totalBytes <= maxBytes) {
    const buf = await fs.readFile(absolutePath);
    return { text: buf.toString('utf8'), truncated: false, totalBytes, readBytes: buf.length };
  }

  const fh = await fs.open(absolutePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(maxBytes);
    const { bytesRead } = await fh.read(buf, 0, maxBytes, 0);
    return {
      text: buf.subarray(0, bytesRead).toString('utf8'),
      truncated: true,
      totalBytes,
      readBytes: bytesRead,
    };
  } finally {
    await fh.close();
  }
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, n));
}

