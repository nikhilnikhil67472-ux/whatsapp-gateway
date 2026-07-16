import fs from 'node:fs';
import path from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { errorDetails, logger } from '../observability/logger';

export type StoredMedia = {
  storageProvider: 'local' | 's3';
  storagePath?: string;
  storageKey: string;
  publicUrl: string;
};

function localPublicUrl(storagePath: string) {
  const relativeUrl = `/${storagePath.replace(/\\/g, '/')}`;
  const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, '');
  return baseUrl ? `${baseUrl}${relativeUrl}` : relativeUrl;
}

function s3Configured() {
  return Boolean(process.env.S3_BUCKET);
}

function s3Client() {
  return new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
}

async function storeInS3(buffer: Buffer, key: string, mimeType: string): Promise<StoredMedia> {
  const bucket = process.env.S3_BUCKET!;
  const client = s3Client();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    ServerSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION as any || undefined,
  }));

  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '');
  const publicUrl = publicBaseUrl
    ? `${publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`
    : await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: Number(process.env.S3_SIGNED_URL_TTL_SECONDS || 86_400) },
      );

  return {
    storageProvider: 's3',
    storageKey: key,
    publicUrl,
  };
}

async function storeLocally(buffer: Buffer, key: string): Promise<StoredMedia> {
  const storagePath = `media/${key}`;
  const publicRoot = path.resolve(process.cwd(), 'public');
  const absolutePath = path.resolve(publicRoot, storagePath);
  if (!absolutePath.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error('Refusing to write media outside the public directory');
  }
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.promises.writeFile(absolutePath, buffer);
  return {
    storageProvider: 'local',
    storagePath,
    storageKey: key,
    publicUrl: localPublicUrl(storagePath),
  };
}

export async function storeMedia(params: {
  buffer: Buffer;
  key: string;
  mimeType: string;
  provider?: string | null;
}) {
  const requestedProvider = params.provider || process.env.MEDIA_STORAGE_PROVIDER || 'local';
  if (requestedProvider === 's3' || requestedProvider === 'minio') {
    if (s3Configured()) {
      try {
        return await storeInS3(params.buffer, params.key, params.mimeType);
      } catch (error) {
        if (process.env.MEDIA_STORAGE_REQUIRED === 'true') throw error;
        logger.error(
          errorDetails(error),
          'S3/MinIO upload failed; using local media storage.',
        );
      }
    } else if (process.env.MEDIA_STORAGE_REQUIRED === 'true') {
      throw new Error('S3_BUCKET is required for the selected media storage provider');
    }
  }
  return storeLocally(params.buffer, params.key);
}

export async function deleteStoredMedia(asset: {
  storage_provider?: string | null;
  storage_path?: string | null;
  storage_key?: string | null;
}) {
  if (
    (asset.storage_provider === 's3' || asset.storage_provider === 'minio')
    && asset.storage_key
    && s3Configured()
  ) {
    await s3Client().send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: asset.storage_key,
    }));
    return;
  }

  if (!asset.storage_path) return;
  const publicRoot = path.resolve(process.cwd(), 'public');
  const mediaRoot = path.resolve(publicRoot, 'media');
  const absolutePath = path.resolve(publicRoot, asset.storage_path);
  if (!absolutePath.startsWith(`${mediaRoot}${path.sep}`)) {
    throw new Error('Refusing to delete media outside the public media directory');
  }
  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
