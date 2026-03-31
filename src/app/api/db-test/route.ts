import { NextResponse } from 'next/server';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  const pgHost = process.env.PGHOST;
  const allDbVars = Object.keys(process.env)
    .filter(k => k.includes('DATABASE') || k.includes('PG') || k.includes('NEON') || k.includes('POSTGRES'))
    .map(k => `${k}=${process.env[k]?.substring(0, 20)}...`);

  return NextResponse.json({
    hasDatabaseUrl: !!dbUrl,
    hasPgHost: !!pgHost,
    dbVars: allDbVars,
    dbUrlPrefix: dbUrl?.substring(0, 30) || 'not set',
  });
}
