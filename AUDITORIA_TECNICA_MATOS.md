# Matos / MozHyper — Auditoria técnica e plano de validação

**Repositório:** `forexlight66-ship-it/Matos`  
**Ramo:** `main`  
**Ambiente:** Next.js + TypeScript, deploy no Render  
**Princípio de segurança:** a plataforma nunca deve substituir o resultado oficial da Deriv por um cálculo próprio. Em caso de conflito, deve registar os dados e parar a negociação automática.

## 1. Contexto e prioridade

Esta auditoria consolida os pedidos feitos nas conversas anteriores e separa três estados: código alterado, comportamento ainda por validar na aplicação e dependências externas que não podem ser certificadas só por revisão de código. Um commit no GitHub ou estado `LIVE` no Render não demonstra que uma negociação real, transferência ou notificação externa funcionou em produção.

Prioridades:
1. **P0 — segurança financeira:** correspondência entre proposta e contrato comprado, preço final/dígito, resultado oficial, stake, saldo e controlo de recuperação.
2. **P1 — execução fiável:** Start/Stop, WebSocket, dados recentes, estados de contratos e prevenção de compras duplicadas.
3. **P1 — dinheiro e pagamentos:** autenticação Deriv, pedido, comprovativo, confirmação do agente, Telegram, estado final de levantamento/depósito e restrições de país/moeda.
4. **P2 — interface e suporte:** tradução PT/EN, histórico, barras, Exit Spots, móvel/desktop e experiência de carregamento.
5. **P2 — manutenção:** observabilidade, testes repetíveis, documentação e redução de trabalho desnecessário do browser.

## 2. Negociação automática e auditoria de contratos

### Regras de execução a preservar
- Robô normal: sinal com os últimos 9 ticks ao vivo, gatilho de 65% segundo a estratégia e verificação imediatamente antes da compra.
- AI Analyst normal: janela de 25 ticks, cinco grupos de cinco, gatilho de 65% e confirmação da janela mais recente.
- AI Analyst em Exit Spots: apenas preços finais reais de contratos fechados do **mesmo símbolo**; usar 28 resultados, quatro grupos de sete e o gatilho acordado de 20%. Não misturar símbolos ou ticks ainda abertos com resultados finais. O modo normal deve continuar disponível quando o modo Exit Spots não tiver dados suficientes, de acordo com a política operacional já pedida.
- Respostas de proposta têm de pertencer ao pedido atual. Uma resposta antiga não pode substituir o sinal mais recente. A compra tem de corresponder à proposta validada.
- Uma compra deve produzir no máximo um evento financeiro processado. As operações abertas não devem ser tratadas como fechadas até a Deriv reportar um estado final.

### Hypercover
- Apenas `DIGITOVER` com barreira **0** ou `DIGITUNDER` com barreira **9**.
- Após uma perda confirmada, a próxima direção obrigatória é a oposta, independentemente das estatísticas.
- Após três perdas consecutivas, aguardar 30 ticks completos antes de retomar o plano de alternância.
- Quick Recover após três perdas consecutivas, sem a exigência de uma janela de nove ticks. A recuperação tem de usar a cotação e o payout reais da direção e barreira que serão comprados.
- Se a cotação não permitir cobrir o défice total em uma operação ou o saldo for insuficiente, não comprar; pausar e informar o motivo. Não inventar um payout nem aplicar um limite de 50% que o utilizador pediu para remover.
- Não aceitar automaticamente uma proposta que omita ou contradiga a intenção da requisição. Os metadados da proposta devem estar ligados ao `req_id` mais recente.

### Auditoria de resultado / imagem recebida
A captura apresentou perdas associadas a `OVER 4` e dígitos mostrados 8 e 9, com o aviso “divergência Deriv/cálculo”. Se o contrato realmente comprado foi `DIGITOVER` barreira 4 e o dígito final foi calculado com a precisão correta, 8/9 deveria satisfazer a barreira. A captura, isoladamente, **não prova** o tipo/barreira real enviados nem o estado oficial `won/lost` da Deriv.

Foram introduzidos:
- registo de diagnóstico do contrato (ID, símbolo, tipo, barreira, preço final, dígito calculado, precisão, estado oficial e P/L);
- distinção entre divergência do dígito/barreira e divergência do estado financeiro;
- utilização da precisão do símbolo do próprio contrato quando disponível;
- bloqueio/paragem do modo automático perante conflito entre o resultado oficial e o cálculo local;
- avisos de histórico em vitórias e perdas, em vez de só nas perdas;
- eliminação de pressupostos que tratavam toda operação OVER como barreira 0 ou toda UNDER como barreira 9, exceto a regra específica de Hypercover;
- marcação de registos históricos incoerentes do tipo “HyperDrive + OVER/UNDER” como registos antigos a confirmar, em vez de atribuir um bot com falsa certeza.

**Validação pendente em Demo:** recolher uma saída real da consola do browser com `[Deriv Digit close audit]` ou `[Hypercover close audit]` e comparar `contract_type`, `barrier`, `exit_spot`, `exit_tick`, `pip_size`, `status` e `profit_loss`. Não retomar automação em conta real enquanto o conflito não estiver explicado.

## 3. IA Power, Sonic, Soros e défice

### Sonic
A regra pedida é: perdas 1, 2 e 3 mantêm a stake normal; a quarta perda consecutiva inicia recuperação. O défice tem de usar o P/L real reportado pela Deriv, e não a stake como aproximação. Cada perda durante recuperação acrescenta a perda real ao défice. A nova stake é calculada com base no payout atual; o ciclo só termina quando o défice total estiver recuperado. O limite visual de níveis Martingale não deve, por si só, apagar o défice.

Foi corrigida a contabilização das perdas durante recuperação em `lib/sonicStakeManager.ts` para adicionar `abs(pnl)` real.

### IA Power
O gestor deve receber o resultado e a stake efetivamente executada, nunca só o valor pedido. O estado da recuperação precisa de ser recalculado com o payout real da proposta, saldo disponível e défice total. Se o payout/saldo não permitir atingir a meta pretendida, a UI e a lógica devem indicar a limitação e não anunciar falsamente que o défice foi recuperado.

### Soros
Foi corrigida a progressão de stake para reinvestir a stake executada mais o lucro líquido real, em vez de repetir simplesmente a stake anterior. O estado guardado restaura lucro acumulado e contagem de repetição em vez de os zerar ao reler a sessão. É necessário validar em Demo a sequência de três vitórias, as perdas, a persistência e o reset de ciclo.

## 4. Histórico, análise e precisão

- Cada registo deve preservar ID do contrato, símbolo, tipo/barreira real, P/L, estado, preço final e origem do dígito.
- O preço final `exit_spot` deve ter prioridade quando existe; `exit_tick` fica como fallback.
- O dígito deve ser extraído com a precisão decimal do símbolo do contrato, não com a precisão de outro símbolo selecionado posteriormente.
- A análise Exit Spots foi restringida ao símbolo atualmente selecionado para não misturar históricos de símbolos diferentes. Como consequência, registos antigos sem símbolo preservado não são considerados prova suficiente para formar os 28 resultados: serão necessários novos fechos corretamente identificados.
- O histórico legado com rótulos incompatíveis deve ser tratado como legado a confirmar; não se deve alterar retroativamente o lucro/prejuízo oficial.
- O P/L total deve ser a soma dos P/Ls oficiais, sem converter perdas em vitórias com base no dígito calculado.

## 5. Conexão Deriv e execução

Verificar em Demo:
- autenticação, saldo, ticks e precisão do símbolo atualizam de forma contínua;
- mensagens atrasadas de propostas são ignoradas e propostas expiradas geram uma nova cotação;
- Start inicia o ciclo sem comprar prematuramente; Stop impede novas entradas e deixa o contrato já comprado fechar corretamente;
- não há dois compradores simultâneos nem repetição do mesmo `contract_id`;
- a troca de símbolo, conta ou estratégia invalida análise anterior e aguarda dados válidos da nova seleção;
- reconexão WebSocket gera uma nova URL autenticada e deteta fluxo de ticks parado;
- saldo, moeda de exibição e stake enviada à Deriv não são confundidos.

## 6. Payment Agent, levantamentos, depósitos, curso e AI Analyst

Requisitos reunidos:
- fluxos elegíveis de moeda local devem mostrar somente os métodos aplicáveis; clientes não elegíveis não devem ver M-Pesa/e-Mola e devem receber a opção USDT TRC20 aplicável ao produto;
- depósito local deve recolher nome/número usado no pagamento e comprovativo; “já paguei” é uma declaração do cliente, nunca uma confirmação automática;
- alerta ao agente no Telegram deve conter que o cliente declarou ter pago, dados de destino, método, montante, nome/número pagador e comprovativo;
- apenas a confirmação do agente deve activar AI Analyst (30 dias) ou Complete Course (acesso ilimitado), sem movimentação de saldo Deriv para estes produtos;
- para depósito normal, a transferência só é concluída quando a API Deriv devolve estado final e ID de transação; se estiver pendente, a UI não deve anunciar conclusão;
- levantamento precisa de código de verificação de seis dígitos, método e dados de destino válidos, estado persistido e consulta posterior ao estado oficial;
- falhas de autenticação, Telegram e API externa devem produzir mensagens claras e logs seguros; nunca afirmar que houve uma transferência sem confirmação da Deriv.

Alterações aplicadas nesta série:
- mensagens Telegram que continham sequências `\\n` literais foram corrigidas para novas linhas reais;
- telas fixas de sucesso/comprovativo do Payment Agent foram ligadas às traduções;
- os endpoints de levantamento e código/estado passaram a tentar renovar a sessão Deriv usando o refresh token guardado no servidor, quando a API devolve 401.

**Validação externa pendente:** testar ponta a ponta em contas autorizadas: submissão de pedido, prova, alerta privado do agente, confirmar/rejeitar, transferência/levantamento, estado pendente, estado concluído, reautenticação, e só então ativar entitlement ou mostrar sucesso. O teste de código, sozinho, não demonstra que Telegram, Deriv ou as variáveis de ambiente de Render estão corretamente configurados.

## 7. Idiomas, moeda e interface

- A interface deve oferecer Português e English; valores antigos em espanhol são normalizados para Português.
- As telas do Payment Agent devem usar as mesmas chaves traduzidas em botões, comprovativos, sucesso e erros, sem texto em português a escapar quando English está ativo.
- Moeda nativa e USD devem ser mostradas de acordo com as regras de país e permissões; moeda de apresentação não deve alterar a moeda ou o valor real enviado ao serviço externo.
- Tema claro é o padrão; testar cores em claro/escuro, conteúdo desktop/mobile, histórico sem overflow, botões, menu e modal.
- O observador de texto de idioma foi otimizado: removeu-se uma varredura redundante ao DOM a cada 500 ms, mantendo a observação de alterações reais.

## 8. Plano de testes de aceitação

### A. Compilação e serviço
1. Confirmar build completo no Render e estado `LIVE` para o último commit.
2. Abrir home/dashboard, iniciar sessão, actualizar e confirmar ausência de erro em runtime e de chamadas de API com 4xx/5xx inesperados.
3. Verificar console do browser para erros React/TypeScript/WebSocket.

### B. Operações Demo
1. Testar um contrato Digits conhecido e guardar os dados oficiais completos.
2. Confirmar que o dígito calculado usa a precisão certa para o símbolo.
3. Simular/observar conflito entre estado e cálculo: a automação deve parar e mostrar aviso, sem reclassificar o P/L.
4. Testar Hypercover: apenas OVER 0/UNDER 9, alternância após perda e pausa exata de 30 ticks após 3 perdas.
5. Testar Quick Recover após três perdas: sem gate de 9 ticks; cotar a barreira certa; se saldo/payout não cobrir o défice numa compra, não comprar; após uma vitória verificar que o défice efetivo é zero antes de sair da recuperação.
6. Testar Sonic: stake base nas três primeiras perdas; quarta perda inicia recuperação; cada perda usa o P/L real; recuperação não pára só porque atingiu o nível máximo.
7. Testar Soros com vitórias e perdas; conferir cada stake com a stake realmente executada e P/L reportado.

### C. Pagamento e tradução
1. Testar separadamente utilizador elegível com MZN e utilizador não elegível com USDT; confirmar que não surgem métodos indevidos.
2. Enviar comprovativo, confirmar que a mensagem Telegram tem linhas reais e os detalhes esperados, testar confirmar e rejeitar.
3. Testar curso e AI Analyst, expiração dos 30 dias e acesso ilimitado do curso.
4. Testar levantamento: pedir código, inserir código errado e correto, acompanhar estado, renovar autenticação expirada e verificar alerta Telegram.
5. Trocar Português ↔ English, recarregar, navegar por cada modal e verificar que a preferência permanece e que não há textos mistos.
6. Testar desktop e Android, claro e escuro, e reinstalação/atualização do PWA se aplicável.

## 9. Critérios para fechar a auditoria

A auditoria só deve ser considerada **validada** quando:
- o deploy de produção está Live no commit esperado;
- build passa sem erros;
- os casos críticos em Demo passam e os logs comprovam a correspondência entre intenção, compra e fecho;
- o fluxo Payment Agent foi verificado ponta a ponta com um agente autorizado;
- as operações com divergência de resultado já não são reproduzidas ou têm causa confirmada e corrigida.

**Estado inicial deste documento:** alterações de código foram feitas e documentadas; a compilação/deploy desta série e os testes end-to-end permanecem por confirmar até que o Render e a aplicação sejam efetivamente testados.
