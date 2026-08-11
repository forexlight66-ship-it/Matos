// components/DigitsGame.tsx

'use client';

import { useState, useEffect } from 'react';
import { useDeriv } from '@/hooks/useDeriv';
import { useLanguage } from '@/contexts/LanguageContext';

const CONTRACT_TYPES = {
  OVER: 'DIGITOVER',
  UNDER: 'DIGITUNDER',
  MATCH: 'DIGITMATCH',
  DIFFERS: 'DIGITDIFF',
} as const;

type ContractChoice = keyof typeof CONTRACT_TYPES;

export default function DigitsGame() {
  const { tick, proposal, buying, getProposal, buy, isAuthorized, isConnected } = useDeriv();
  const { t } = useLanguage();
  const [contractType, setContractType] = useState<ContractChoice>('OVER');
  const [amount, setAmount] = useState(10);
  const [duration, setDuration] = useState(60);
  const [digit, setDigit] = useState(5);
  const [symbol, setSymbol] = useState('R_100');

  useEffect(() => {
    if (isAuthorized && isConnected) {
      const contract = CONTRACT_TYPES[contractType];
      getProposal(symbol, contract, amount, duration, digit);
    }
  }, [contractType, amount, duration, digit, symbol, isAuthorized, isConnected, getProposal]);

  const handleBuy = () => {
    if (proposal) buy(proposal.id, proposal.ask_price);
  };

  return (
    <div className="card mb-6">
      <h2 className="text-xl font-bold mb-4">{t('digitsTrading')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('symbol')}</label>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            <option value="R_100">{t('volatility')} 100</option>
            <option value="R_50">{t('volatility')} 50</option>
            <option value="R_10">{t('volatility')} 10</option>
            <option value="1HZ10V">1HZ10V</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('contractType')}</label>
          <select
            value={contractType}
            onChange={(e) => setContractType(e.target.value as ContractChoice)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            <option value="OVER">{t('over')}</option>
            <option value="UNDER">{t('under')}</option>
            <option value="MATCH">{t('match')}</option>
            <option value="DIFFERS">{t('differs')}</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('amount')}</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            min="1"
            step="1"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('duration')}</label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value) || 60)}
            min="5"
            step="5"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('digit')}</label>
          <input
            type="number"
            value={digit}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val) && val >= 0 && val <= 9) setDigit(val);
            }}
            min="0"
            max="9"
            step="1"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('currentPrice')}</label>
          <div className="mt-1 block w-full py-2 px-3 bg-gray-50 rounded-md border border-gray-200">
            {tick ? tick.quote : t('waitingTick')}
          </div>
        </div>
      </div>

      {proposal && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-blue-800">{t('proposalQuote')}</h3>
          <div className="grid grid-cols-3 gap-4 mt-2">
            <div>
              <span className="text-sm text-gray-500">{t('askPrice')}:</span>
              <span className="ml-2 font-medium">{proposal.ask_price}</span>
            </div>
            <div>
              <span className="text-sm text-gray-500">{t('payout')}:</span>
              <span className="ml-2 font-medium">{proposal.payout}</span>
            </div>
            <div>
              <span className="text-sm text-gray-500">{t('stake')}:</span>
              <span className="ml-2 font-medium">{proposal.stake}</span>
            </div>
          </div>
          <button
            onClick={handleBuy}
            disabled={buying || !isAuthorized}
            className="mt-4 w-full md:w-auto px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {buying ? t('buying') : `${t('buy')} ${contractType} ${proposal.ask_price} USD`}
          </button>
        </div>
      )}

      {!isAuthorized && (
        <p className="mt-4 text-red-600 text-sm">{t('unauthorizedWarning')}</p>
      )}
    </div>
  );
}
