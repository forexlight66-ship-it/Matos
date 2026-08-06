// components/ProfitTable.tsx

'use client';

import { useEffect, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ProfitTable() {
  const { profitTransactions, profitCount, loadingProfit, fetchProfitTable } = useDeriv();
  const { t } = useLanguage();
  const [page, setPage] = useState(0);
  const limit = 20;

  useEffect(() => {
    fetchProfitTable({ limit, offset: page * limit, sort: 'DESC' });
  }, [page, fetchProfitTable]);

  const totalPages = Math.ceil(profitCount / limit);

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">{t('profitTable')}</h2>
      {loadingProfit && <p>{t('loading')}</p>}
      {!loadingProfit && profitTransactions.length === 0 && <p>{t('noTransactions')}</p>}
      {profitTransactions.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('contractId')}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('type')}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('buyPrice')}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sellPrice')}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('payout')}</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('profitLoss')}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('purchaseTime')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {profitTransactions.map((tx) => {
                  const pnl = tx.profit_loss ?? 0;
                  return (
                    <tr key={tx.contract_id}>
                      <td className="px-4 py-2 whitespace-nowrap text-sm">{tx.contract_id}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm">{tx.contract_type}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right">{tx.buy_price}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right">{tx.sell_price ?? t('open')}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right">{tx.payout}</td>
                      <td className={`px-4 py-2 whitespace-nowrap text-sm text-right font-medium ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {pnl !== 0 ? pnl : '—'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm">{new Date(tx.purchase_time * 1000).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-2">
            <span className="text-sm text-gray-600">{t('total')} {profitCount} {t('transactions')}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                {t('previous')}
              </button>
              <span className="text-sm">{t('page')} {page + 1} / {totalPages || 1}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                {t('next')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
