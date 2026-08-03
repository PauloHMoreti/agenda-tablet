# Agenda do Tablet

Servidor simples pra transformar um tablet antigo (Android 2.3, touch quebrado) em
um mostrador de agenda diária, controlado remotamente por um painel web.

## Sobre o projeto

Eu tinha um tablet Android 2.3 parado numa gaveta com o touch quebrado (só mouse
funciona) e um notebook antigo (Core 2 Duo, 3GB RAM) que também não tinha mais uso.
Em vez de descartar os dois, montei um sistema de agenda diária: o notebook virou um
servidor Linux headless na rede local, e o tablet virou um mostrador passivo — uma
espécie de "quadro de tarefas" físico sempre visível, sem precisar tocar em nada.

O desafio técnico principal foi lidar com as limitações do navegador de 2011 no
tablet (sem suporte a JS moderno, sem HTTPS confiável, sem API de notificações), o
que empurrou várias decisões de arquitetura: renderização 100% no servidor pra tela
passiva, um sistema de alerta sonoro como alternativa às notificações nativas do
navegador (que exigem contexto seguro/HTTPS), e armazenamento em arquivo JSON puro
pra evitar dependências nativas que não compilam em qualquer plataforma.

## Funcionalidades

- **3 telas com propósitos diferentes**: uma tela passiva (tablet, sem interação),
  um painel administrativo completo, e uma tela de controle rápido pro dia a dia.
- **Blocos de tempo** com prioridade (alta/média/baixa) em vez de itens soltos —
  cada bloco pode acumular vários registros do que foi feito dentro do período.
- **Detecção automática de atraso**, calculada em tempo real (sem precisar marcar
  manualmente), com indicador visual dedicado.
- **Alertas sonoros + título da aba piscando** como alternativa funcional a
  notificações nativas do navegador, contornando a exigência de HTTPS.
- **Calendário mensal** com visão geral de quantos blocos, atrasos e conclusões por dia.
- **Zero dependências nativas** — armazenamento em JSON simples, `npm install`
  funciona em qualquer SO sem precisar de compilador C++/Visual Studio Build Tools.

## Stack

Node.js · Express · HTML/CSS/JS puro (sem framework de front-end) · armazenamento em
arquivo JSON · Debian (servidor) · systemd (persistência do processo)

> **Vai instalar em um servidor físico dedicado (ex: notebook antigo)?** Veja o guia
> completo em [`SETUP-SERVIDOR.md`](./SETUP-SERVIDOR.md) — cobre escolha de SO, instalação
> do Debian sem interface gráfica, Node.js, systemd, gestão de energia da tampa e IP fixo.

## Rodando localmente

```bash
npm install
cp data.json.example data.json   # dados de exemplo, opcional
node server.js
```
Acesse `http://localhost:3000/display`, `/admin` e `/control`.

## Sobre o desenvolvimento

Esse projeto foi construído em parceria com o [Claude](https://claude.ai), da Anthropic —
da concepção da arquitetura (o que rodar no tablet vs. no servidor, como contornar as
limitações do navegador Android 2.3) até a implementação do backend, front-end e o
guia de deploy no servidor físico. As decisões de produto e a definição dos requisitos
foram minhas; o Claude ajudou a explorar alternativas técnicas, escrever e revisar o
código, e depurar problemas reais que só apareceram durante a instalação no hardware
(driver de Wi-Fi, permissões de arquivo, etc).

## As 3 telas

- **`/display`** — a tela do tablet antigo. Só leitura, sem JS, atualiza sozinha a
  cada 2 minutos. Mostra os blocos do dia com cor de prioridade e um selo vermelho
  "ATRASADA" quando o horário final passa sem o bloco ser concluído.
- **`/admin`** — painel completo pra criar/editar/excluir blocos, prioridade,
  registros e copiar o dia anterior. Use no PC, celular ou Chromebook.
- **`/control`** — tela enxuta pensada pra usar durante o dia (celular/PC) pra
  marcar bloco como concluído, adicionar mais tempo (+30min) e registrar o que foi
  feito. **Não funciona no tablet antigo** — o navegador do Android 2.3 não
  suporta a API de notificações do navegador.

  Sobre alertas: como o servidor roda em HTTP simples (sem certificado), o
  navegador bloqueia notificações nativas nesse caso — elas só funcionam em
  HTTPS ou `localhost`. Por padrão a tela usa **som + título da aba piscando**
  como alerta (funciona em HTTP normalmente, clique em "Ativar som" uma vez).
  Se quiser notificação nativa de verdade, dá pra configurar HTTPS local com
  [mkcert](https://github.com/FiloSottile/mkcert): gera um certificado confiável
  só pros seus próprios aparelhos, sem precisar expor nada na internet.

## Como funciona o fluxo de "bloco de tempo"

1. No `/admin` (ou `/control`), crie um bloco base: título, horário de início/fim,
   prioridade. Ex: "Trabalhar no sistema AptivIA", 10:00–12:00, Alta.
2. Durante esse período, vá registrando o que você realmente fez (ex: "Adicionar
   função x no sistema A") — cada registro tem um horário próprio.
3. Quando o horário do bloco terminar:
   - Se acabou o que precisava, clique em **Concluir**.
   - Se precisa de mais tempo, clique em **+15min** / **+30min** — o bloco
     continua "em andamento" com o novo horário final.
   - Se você não fizer nada, o bloco automaticamente vira **ATRASADA** (calculado
     na hora, não precisa marcar manualmente), e o alerta desaparece assim que
     você concluir ou estender o bloco.

## Como rodar (no PC ou Raspberry Pi que vai ficar sempre ligado)

1. Instale o Node.js (v18+ recomendado).
2. Dentro desta pasta, rode:
   ```
   npm install
   node server.js
   ```
3. O servidor sobe na porta 3000, acessível por qualquer aparelho da rede local.

## Descobrir o IP do servidor na rede local

- Linux/Raspberry Pi: `hostname -I`
- Windows: `ipconfig` (procure "Endereço IPv4")

Anote esse IP (ex: 192.168.0.15) — vai usar em dois lugares:

- **No seu celular/PC**: `http://192.168.0.15:3000/admin` → painel pra editar a agenda
- **No tablet antigo**: `http://192.168.0.15:3000/display` → tela que mostra o dia

## Deixar o IP do servidor fixo

Pra não quebrar quando o roteador trocar o IP, reserve um IP fixo pro
PC/Raspberry Pi nas configurações do roteador (DHCP reservation / IP reservado
por endereço MAC). Isso evita ter que reconfigurar o tablet depois.

## Configurar o tablet (Android 2.3)

1. Abra o navegador padrão (com o mouse).
2. Digite a URL `/display` (ex: `http://192.168.0.15:3000/display`).
3. Defina essa URL como página inicial (Menu do navegador > Configurações > Página inicial).
4. Ative o modo tela cheia do navegador, se disponível (Menu > Tela cheia).
5. Em Configurações do Android:
   - Desative o bloqueio de tela (Configurações > Segurança > Bloqueio de tela > Nenhum)
   - Aumente o tempo de suspensão da tela pro máximo (Configurações > Tela > Suspensão)
     ou, melhor ainda, deixe o tablet sempre na tomada — sem suspensão automática.
6. A página se recarrega sozinha a cada 5 minutos (não precisa mexer em mais nada).

## Uso diário

Acesse `/admin` de qualquer aparelho na rede pra:
- Criar blocos de tempo com prioridade (Alta/Média/Baixa)
- Registrar o que foi feito dentro de cada bloco
- Concluir ou estender (+15/+30 min) um bloco
- Trocar de data (pra planejar o dia seguinte com antecedência)
- Copiar os blocos do dia anterior como ponto de partida

Durante o dia, prefira o `/control` no celular — é mais rápido pra marcar
conclusão/estender e você recebe notificação quando um bloco atrasa.

## Próximos passos possíveis (se quiser evoluir depois)

- Itens recorrentes (ex: "almoço" todo dia às 12h sem precisar recriar)
- Autenticação simples no /admin (usuário/senha) se outras pessoas tiverem acesso à rede
- Acesso remoto de fora de casa via VPN (ex: Tailscale/WireGuard) — mais simples e
  seguro que expor a porta 3000 direto na internet, e evita todo o problema de
  certificado SSL no Android antigo, porque o tráfego fica dentro da VPN.
