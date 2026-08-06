// app/api/auth/logout/route.ts

import { NextResponse } from 'next/server';

export async function GET() {
  const response = NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'));
  response.cookies.delete('deriv_access_token');
  response.cookies.delete('deriv_refresh_token');
  return response;
}
