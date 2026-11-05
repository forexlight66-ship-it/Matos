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

Foi acrescentado um worker em processo (worker/runtime-worker.ts), iniciado por instrumentation.ts dentro do Web Service Node existente, sem criar outro serviço Render. O worker adquire lease na Neon, liga-se à Deriv com OAuth server-side, recebe ticks, cria intenções idempotentes, solicita proposta/compra, acompanha contratos, grava resultados, aplica limites de sessão e consome pedidos de paragem. O arranque é restrito a Demo. Esta primeira execução server-side ainda não representa a migração integral de todas as estratégias.

## Migração necessária antes de retirar a lógica do browser

1. **Motor de estado**: portar literalmente as regras de entrada e saída, incluindo janelas de ticks, AI Analyst, Exit Spots, symbol scoring, HyperBeen, HyperFlows, Hypercover, HyperGuard, HyperShield, HyperBreak, HyperSwap, IA Power e Sonic.
2. **Executor**: gerir cotações live, stake, limites de saldo, idempotência, compra, confirmação, contrato aberto e reconciliação de ordem incerta após reconexão. Não repetir compras automaticamente quando a confirmação for ambígua.
3. **Persistência**: guardar todos os parâmetros e estados de recuperação, sequência de ticks, saldo, contratos activos, P/L e histórico por `user_id + account_id`. O worker deve obter lease exclusivo por conta.
4. **API de controlo**: existem endpoints autenticados Start (Demo apenas), Stop e Status com validação de origem. O browser envia configuração allowlisted; nunca token, account_id arbitrário, proposta ou comando buy/sell.
5. **Dashboard**: o botão Start/Stop já encaminha o controlo para a API server-side e o dashboard recupera/consulta o estado do runtime. Ainda falta remover completamente useDeriv, lib/websocket.ts e a lógica/estratégias do bundle final; por isso, a inspecção do bundle ainda pode revelar código de negociação antigo.
6. **Testes de paridade**: replay de séries de ticks e resultados históricos, comparação do sinal antigo/novo, casos de payout variável, contrato com resultado ambíguo, falha de rede, duplicate ack, worker restart e duas janelas no mesmo utilizador.
7. **Cutover**: só depois de todos os testes Demo passarem, ativar execução no servidor e bloquear completamente qualquer caminho antigo de compra no browser.

## Recursos e segredos

- O serviço Matos-1N actualmente publicado é um Web Service Render Free. A migração deve respeitar a exigência de custo zero: não criar Background Worker, Cron Job, Redis, outra base de dados nem actualizar o plano.
- A opção sem custos adicionais é executar o ciclo de trabalho dentro do processo do Web Service existente, com arranque controlado no servidor, lease na Neon, heartbeat, recuperação após reinício e limites de concorrência. Isto é uma execução oportunista: Render Free pode suspender ou reiniciar o processo, portanto não garante negociação contínua 24/7 quando não há tráfego. Não apresentar essa limitação como serviço autónomo permanente.
- O worker e as APIs partilham a base de dados Neon existente através de `DATABASE_URL`; não é necessária outra base de dados nem Redis para esta arquitectura inicial.
- Os tokens OAuth Deriv já associados às contas Matos são obtidos do armazenamento seguro existente no servidor; o worker não pede ao utilizador que introduza um token nem exige configurar manualmente um token Deriv no Render. A cifragem AES-256-GCM mantém compatibilidade com a chave legada já usada pela aplicação (`DERIV_PAYMENT_AGENT_TOKEN`). `DERIV_TOKEN_ENCRYPTION_KEY` é apenas uma opção adicional de rotação/isolamento de chave, não é obrigatória para executar a migração e não deve ser adicionada ao Render como pré-requisito. Não remover nem alterar os segredos existentes. O worker recebe apenas a credencial da conta autenticada, através das funções server-side, nunca do browser.
- O worker necessita também de `DERIV_APP_ID`. Os valores das variáveis secretas não devem ser enviados ao browser ou registados em logs.

## Trabalho implementado nesta revisão

- `lib/platform-auth.ts`: mantém leitura server-side dos tokens OAuth já guardados e suporta opcionalmente uma chave de cifragem dedicada. A chave dedicada não é obrigatória; sem ela, continua a usar a chave legada já configurada na aplicação. Não é necessário pedir token Deriv ao utilizador nem criar variáveis novas no Render.

- `app/api/trading/runtime/route.ts`: endpoint autenticado para consultar o estado resumido do runtime e registar pedido de paragem. Não devolve `account_id`, tokens, leases nem estado interno completo. O endpoint não inicia negociações; o executor ainda precisa de consumir o pedido de paragem.

## Critério de produção

Não remover o motor antigo nem activar negociação pelo worker enquanto:
- O executor server-side não compilar e iniciar dentro do Web Service Render existente, sem criar serviço pago; validar explicitamente o comportamento após suspensão/reinício do Render Free;
- A API não estiver autenticada e testada com dois utilizadores diferentes;
- Não houver testes automáticos de paridade para todas as estratégias e máquinas de recuperação;
- A Deriv não for validada em Demo com compra, fecho, reconciliação, reinício do worker e duplicação de sessão;
- O browser bundle não tiver deixado de importar o motor de estratégia e o WebSocket de negociação.

**Estado actual: ainda não pronto para produção.** A arquitetura aprovada para esta migração não cria um Background Worker pago: o executor terá de correr no processo do Web Service Free existente e aceitar que a suspensão do Render interrompe a execução. O endpoint de status/paragem é apenas uma etapa de controlo; o executor worker, API Start, reconciliação de ordens, remoção da lógica do browser e testes Demo continuam pendentes. Manter o deploy live actual e não utilizar uma conta Real para testar.

## Progresso da execução server-side

- Existe API Start autenticada que valida sessão Matos, credencial OAuth renovável e identidade/conta Demo no servidor. Não aceita conta Real nem token enviado pelo browser.
- Existe worker em processo no serviço existente, com lease/heartbeat, tick stream, intenção idempotente, proposta/compra, acompanhamento de contrato, histórico, limites de lucro/perda e paragem graciosa após contrato aberto.
- O worker reconcilia intenções não resolvidas com o portfolio após reinício; quando não consegue provar o resultado, bloqueia novas compras por segurança.
- O dashboard encaminha Start/Stop e consulta o estado do runtime. O executor antigo do browser deixa de ser armado pelo novo botão Start.
- Nenhum Background Worker, Redis, Cron, nova base de dados ou plano pago foi criado.

## Pendências que impedem a migração integral

- A máquina de recuperação Hypercover já está ligada ao executor: alterna entre OVER 1 e UNDER 8 após perda e pausa 30 ticks após três perdas consecutivas. HyperBeen e HyperFlows continuam sem integração completa e permanecem bloqueados no Start server-side.
- A lógica HyperBeen (PAR → PAR → ÍMPAR → ÍMPAR, pausa de 50 ticks e défice + lucro extra) e HyperFlows (5 perdas, OVER 0 e paragem após perda da recuperação) ainda precisa de ser integrada e testada.
- Falta portar AI Analyst 25 ticks/5×5, Exit Spots 28/4×7 (apenas modo Exit Spots), seleção dinâmica HyperFlow, regras IA Power/Sonic e restantes limiares especiais.
- O executor usa proposta + buy por ID; a equivalência com o caminho de compra directa existente no browser ainda precisa de validação Deriv Demo antes de alterar a semântica de compra.
- Falta teste Demo end-to-end, testes automáticos das transições de recuperação e verificação final de que nenhuma lógica de compra/estratégia fica no bundle do browser. A integração Hypercover desta revisão ainda precisa de validação de paridade em Demo.
- Render Free pode suspender/reiniciar o processo; não há garantia de execução autónoma 24/7.
