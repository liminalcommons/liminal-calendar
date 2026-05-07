import { NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/r2';
import { auth } from '../../../../../auth';

const ALLOWED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  'application/vnd.ms-powerpoint', // ppt
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/markdown',
  'text/plain',
]);
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

export async function POST(request: Request) {
  const session = await auth().catch(() => null);
  if (!session?.user) return NextResponse.json({ error: 'Sign in to upload.' }, { status: 401 });
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Allowed: PDF, PPTX, DOCX, images, markdown.` },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (25 MB max).' }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    const key = `marketplace/submissions/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadToR2(key, buffer, file.type);

    return NextResponse.json({
      url,
      name: file.name,
      type: file.type,
      size: file.size,
    });
  } catch (e) {
    console.error('Marketplace upload error:', e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
