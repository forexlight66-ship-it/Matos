import { NextResponse } from 'next/server';

type CurrencyConfig = { country: string; currency: string; symbol: string; rate: number };

const COUNTRIES: Record<string, CurrencyConfig> = {
  MZ: { country: 'Mozambique', currency: 'MZN', symbol: 'MT', rate: 64 },
  KE: { country: 'Kenya', currency: 'KES', symbol: 'KSh', rate: 129 },
  AO: { country: 'Angola', currency: 'AOA', symbol: 'Kz', rate: 920 },
  NG: { country: 'Nigeria', currency: 'NGN', symbol: '₦', rate: 1300 },
  ZA: { country: 'South Africa', currency: 'ZAR', symbol: 'R', rate: 16 },
  CO: { country: 'Colombia', currency: 'COP', symbol: 'COP', rate: 3100 },
  BR: { country: 'Brazil', currency: 'BRL', symbol: 'R$', rate: 5.15 },
  JM: { country: 'Jamaica', currency: 'JMD', symbol: 'J$', rate: 157.3 },
  RU: { country: 'Russia', currency: 'RUB', symbol: '₽', rate: 81 }
};

function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip')?.trim() || '';
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  let countryCode = '';
  let detectedCountry = '';

  if (ip && !['127.0.0.1', '::1', 'localhost'].includes(ip)) {
    try {
      const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        countryCode = String(data?.country_code || '').toUpperCase();
        detectedCountry = String(data?.country_name || '');
      }
    } catch {}
  }

  const native = COUNTRIES[countryCode];
  const currencies = native
    ? [
        { currency: 'USD', symbol: '$', label: '$ USD', rate: 1 },
        { currency: native.currency, symbol: native.symbol, label: `${native.symbol} ${native.currency}`, rate: native.rate }
      ]
    : [{ currency: 'USD', symbol: '$', label: '$ USD', rate: 1 }];

  return NextResponse.json({
    detectedBy: 'ip',
    countryCode,
    country: native?.country || detectedCountry || null,
    currencies,
    defaultCurrency: native?.currency || 'USD'
  }, {
    headers: { 'Cache-Control': 'private, max-age=300' }
  });
}
