import { NextResponse } from 'next/server'
import { auth } from '../../../../auth'

const HYLO_UPLOAD_URL = 'https://www.hylo.com/noo/upload'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Server-side validation (defense in depth)
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' }, { status: 400 })
    }
    const MAX_SIZE = 5 * 1024 * 1024 // 5MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum 5MB' }, { status: 400 })
    }

    // Forward the file to Hylo's upload endpoint
    const hyloForm = new FormData()
    hyloForm.append('file', file)

    const res = await fetch(HYLO_UPLOAD_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
      },
      body: hyloForm,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'Upload failed')
      console.error('Hylo upload error:', res.status, text)
      return NextResponse.json({ error: 'Image upload failed' }, { status: 502 })
    }

    const data = await res.json()
    // Hylo returns { url: "https://..." } or similar
    const url = data.url || data.imageUrl || data.path
    if (!url) {
      console.error('Hylo upload: no URL in response', data)
      return NextResponse.json({ error: 'No URL returned from upload' }, { status: 502 })
    }

    return NextResponse.json({ url })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
