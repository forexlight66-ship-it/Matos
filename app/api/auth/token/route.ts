// app/api/auth/token/route.ts

import { NextRequest, NextResponse } from 'next/server';

/**
 * Returns the short-lived Deriv access token to the authenticated dashboard.
 * The OAuth token itself remains in an HttpOnly cookie at rest.
 * This endpoint is intentionally same-origin and only returns the token when
 * the authenticated session cookie is present.
 */
export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('deriv_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json(
    { authenticated: true, accessToken },
    {
      headers: {
        'Cache-Control': 'no-store, private',
      },
    }
  );
}
