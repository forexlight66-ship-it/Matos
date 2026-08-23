# Soros — ciclo de 3 passos

O robô pode usar o modo **Soros** com entrada base de **US$ 1,50** e retorno estimado de **95%**. A progressão usa somente o lucro acumulado; o capital inicial não é reutilizado como stake nos passos 2 e 3.

> **Importante:** o retorno real depende do payout informado pela corretora. Os valores abaixo são o modelo de referência de 95%.

| Passo | Valor da entrada | Origem do dinheiro | Se vencer | Se perder |
|---|---:|---|---|---|
| **1** | **US$ 1,50** | Sua banca real | Ganha **~US$ 1,42**. Os US$ 1,50 originais ficam preservados na banca. | Perde **US$ 1,50**. A banca vai para US$ 98,50 no exemplo de US$ 100. **Pare e espere.** |
| **2** | **US$ 1,42** | Apenas o lucro anterior | Ganha **~US$ 1,35**. Acumulado: **US$ 2,77**. | Perde apenas o lucro. A banca volta a **US$ 100,00** no exemplo. **Prejuízo real: US$ 0. Pare.** |
| **3** | **US$ 2,77** | Todo o lucro acumulado | Ganha **~US$ 2,63**. **Fim do ciclo. Ganho total: US$ 5,40.** | Perde apenas o lucro acumulado. A banca volta a **US$ 100,00** no exemplo. **Prejuízo real: US$ 0. Pare.** |

## Regras do robô

1. Começa sempre no **Passo 1 — US$ 1,50**.
2. Vitória no Passo 1: a próxima entrada é **US$ 1,42**.
3. Vitória no Passo 2: a próxima entrada é **US$ 2,77** (US$ 1,42 + US$ 1,35).
4. Qualquer perda encerra imediatamente o ciclo e volta à entrada base.
5. Vitória no Passo 3 encerra o ciclo e volta à entrada base no próximo ciclo.
6. O Soros não deve aumentar a entrada acima dos três passos definidos.
7. A progressão é calculada com payout de referência de 95%; o robô deve usar o resultado real apenas para decidir vitória/derrota e parar o ciclo quando necessário.

### Exemplo com banca de US$ 100

- Passo 1 perde → **US$ 98,50**.
- Passo 1 vence → banca aproximada **US$ 101,42**; Passo 2 arrisca somente o lucro.
- Passo 2 perde → **US$ 100,00**.
- Passos 1 + 2 vencem → lucro acumulado **US$ 2,77**; Passo 3 usa esse lucro.
- Passo 3 vence → ganho aproximado do ciclo **US$ 5,40**.
- Passo 3 perde → volta ao capital inicial do exemplo, **US$ 100,00**.
