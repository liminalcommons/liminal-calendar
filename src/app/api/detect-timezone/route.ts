import { NextRequest, NextResponse } from 'next/server';

// IP Geolocation fallback using ip-api.com (free, no API key, 45 req/min)
export async function GET(request: NextRequest) {
  try {
    // Get client IP from headers (works behind proxies/Vercel)
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const ip = forwardedFor?.split(',')[0]?.trim() || realIp || '';

    // Skip for localhost/private IPs
    if (!ip || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return NextResponse.json({
        timezone: 'UTC',
        city: 'Unknown',
        country: 'Unknown',
        source: 'fallback',
      });
    }

    // Query ip-api.com for geolocation
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,timezone,city,country`, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error('IP geolocation service unavailable');
    }

    const data = await response.json();

    if (data.status === 'fail') {
      return NextResponse.json({
        timezone: 'UTC',
        city: 'Unknown',
        country: 'Unknown',
        source: 'fallback',
        error: data.message,
      });
    }

    return NextResponse.json({
      timezone: data.timezone || 'UTC',
      city: data.city || 'Unknown',
      country: data.country || 'Unknown',
      source: 'ip',
    });
  } catch (error) {
    console.error('IP geolocation error:', error);
    return NextResponse.json({
      timezone: 'UTC',
      city: 'Unknown',
      country: 'Unknown',
      source: 'fallback',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
