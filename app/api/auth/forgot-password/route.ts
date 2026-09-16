import { NextRequest, NextResponse } from 'next/server';
import { createPasswordResetToken, safeErrorMessage } from '@/lib/platform-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || '').trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'Email inválido.' }, { status: 400 });
    }

    const reset = await createPasswordResetToken(email);

    // Always return the same public response so registered emails cannot be enumerated.
    if (reset) {
      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.RESEND_FROM;
      if (!apiKey || !from) {
        console.error('[Auth] Password reset email is not configured: RESEND_API_KEY/RESEND_FROM missing.');
      } else {
        const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin).replace(/\/$/, '');
        const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(reset.token)}`;
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [reset.user.email],
            subject: 'Reset your MozHyper password',
            html: `
              <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#171717">
                <h2 style="margin-bottom:8px">MozHyper</h2>
                <p>Hello ${escapeHtml(reset.user.name)},</p>
                <p>We received a request to reset your MozHyper password.</p>
                <p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#ff444f;color:#fff;text-decoration:none;border-radius:7px;font-weight:700">Reset password</a></p>
                <p>This link expires in 30 minutes and can only be used once.</p>
                <p>If you did not request this, you can safely ignore this email.</p>
              </div>
            `,
          }),
        });

        if (!emailResponse.ok) {
          const detail = await emailResponse.text();
          console.error('[Auth] Resend password reset failed:', detail);
        }
      }
    }

    return NextResponse.json({ ok: true, message: 'If that email is registered, a password reset link has been sent.' });
  } catch (error) {
    console.error('[Auth] forgot-password failed:', safeErrorMessage(error));
    return NextResponse.json({ ok: true, message: 'If that email is registered, a password reset link has been sent.' });
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
}
