import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST() {
  return NextResponse.json(
    {
      error: 'O pagamento do Signal Unlimited foi desativado. Clique no ícone Signal Unlimited para abrir o Telegram diretamente.',
      code: 'SIGNALS_PAYMENT_DISABLED',
    },
    {
      status: 410,
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    },
  );
}
