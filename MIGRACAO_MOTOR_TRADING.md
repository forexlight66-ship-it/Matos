# Migração do motor de negociação para servidor privado

Estado desta branch: **fundação técnica em desenvolvimento; não pronta para produção**.
A versão live continua a ser `main` e não é alterada por esta branch.

## Auditoria da implementação actual

A lógica principal está agregada em `components/AutoBotV4.tsx` (componente client):
- Extracção de dígitos, análise de frequências e tendências;
- Classificação de sinais e seleção de estratégias;
- AI Analyst (25 ticks em cinco blocos), normal robot, Exit Spots (28 resultados em quatro blocos);
- Máquina de estados HyperBeen, HyperFlows e Hypercover;
- Gestão de stake IA Power e Sonic;
- Regras de stop/target e validação do resultado oficial da Deriv;
- Envio de ordens e coordenação de propostas/contratos.

`hooks/useDeriv.ts` e `lib/websocket.ts` executam no browser a ligação Deriv, recepção de ticks, propostas, compras, subscrições de contratos e reconciliação. Enquanto o dashboard importar estes módulos, a lógica e os comandos permanecem inspecionáveis no bundle.

## Fundação técnica criada nesta branch

- `server/trading/strategy-analysis.ts`: extração server-side das funções de análise de ticks, scoring, sinais normais, AI Analyst e Exit Spots.
- `server/trading/recovery.ts`: transições explícitas e serializáveis para HyperBeen, HyperFlows e Hypercover.
- `worker/repository.ts`: tabelas persistentes, leases concorrentes, eventos, intenções de ordem com chave única por tick e histórico de contratos.
- `worker/deriv-gateway.ts`: gateway WebSocket privado, associação da identidade Deriv ao utilizador Matos, OTP de Options e métodos de consulta de proposta/compra/contrato.

Estes módulos são apenas uma camada inicial. Ainda não existe um ciclo worker completo e não devem receber sessões de negociação.

## Migração necessária antes de retirar a lógica do browser

1. **Motor de estado**: portar literalmente as regras de entrada e saída, incluindo janelas de ticks, AI Analyst, Exit Spots, symbol scoring, HyperBeen, HyperFlows, Hypercover, HyperGuard, HyperShield, HyperBreak, HyperSwap, IA Power e Sonic.
2. **Executor**: gerir cotações live, stake, limites de saldo, idempotência, compra, confirmação, contrato aberto e reconciliação de ordem incerta após reconexão. Não repetir compras automaticamente quando a confirmação for ambígua.
3. **Persistência**: guardar todos os parâmetros e estados de recuperação, sequência de ticks, saldo, contratos activos, P/L e histórico por `user_id + account_id`. O worker deve obter lease exclusivo por conta.
4. **API de controlo**: criar start/stop/status/eventos autenticados por sessão Matos. O browser só poderá enviar configuração allowlisted; nunca token, account_id arbitrário, proposta ou comando buy/sell.
5. **Dashboard**: substituir `useDeriv` e a máquina de estados em `AutoBotV4.tsx` por uma interface que leia estado do servidor e envie apenas comandos de alto nível. Remover `lib/websocket.ts` e os módulos de estratégia do bundle final.
6. **Testes de paridade**: replay de séries de ticks e resultados históricos, comparação do sinal antigo/novo, casos de payout variável, contrato com resultado ambíguo, falha de rede, duplicate ack, worker restart e duas janelas no mesmo utilizador.
7. **Cutover**: só depois de todos os testes Demo passarem, ativar execução no servidor e bloquear completamente qualquer caminho antigo de compra no browser.

## Recursos e segredos

- O serviço Matos-1N actualmente publicado é um Web Service Render Free. Free Web Services podem suspender/reiniciar; não são apropriados para um robô que deve continuar a operar sem o navegador aberto.
- O serviço dedicado deve ser um Render Background Worker em região Oregon, plano pago Starter (0.5 CPU / 512 MB como configuração mínima inicial). Este plano é uma despesa adicional e não foi criado nem activado nesta branch.
- O worker deve partilhar a mesma base de dados Neon através de `DATABASE_URL`; não é necessário criar outra base de dados nem Redis para esta primeira arquitectura de polling/leases no Postgres.
- O token Deriv individual está cifrado usando uma chave derivada actualmente de `DERIV_PAYMENT_AGENT_TOKEN`. Antes de colocar tokens no worker, criar `DERIV_TOKEN_ENCRYPTION_KEY` independente e executar uma migração transaccional que re-cifre todos os tokens dos utilizadores e a credencial de parceiro. O worker não deve receber o segredo do Payment Agent.
- O worker necessita também de `DERIV_APP_ID`. Os valores das variáveis secretas não devem ser enviados ao browser ou registados em logs.

## Critério de produção

Não remover o motor antigo nem activar negociação pelo worker enquanto:
- O worker não compilar e iniciar como serviço separado;
- A API não estiver autenticada e testada com dois utilizadores diferentes;
- Não houver testes automáticos de paridade para todas as estratégias e máquinas de recuperação;
- A Deriv não for validada em Demo com compra, fecho, reconciliação, reinício do worker e duplicação de sessão;
- O browser bundle não tiver deixado de importar o motor de estratégia e o WebSocket de negociação.

**Neste estado, manter o deploy live actual.** Não aplicar esta branch ao serviço Matos-1N e não utilizar uma conta Real para testar.
