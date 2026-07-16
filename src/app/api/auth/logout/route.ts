import { NextResponse } from 'next/server';
import { DASHBOARD_COOKIE } from '@/lib/security/dashboard-auth';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(DASHBOARD_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
