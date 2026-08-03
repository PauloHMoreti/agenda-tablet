# Guia: transformando o notebook antigo em servidor da agenda

Hardware: Core 2 Duo T5800, 3GB RAM, HDD 500GB — mais que suficiente pra isso.

## 1. Gravar o instalador do Debian num pendrive

1. Baixe a imagem **netinst** (pequena, baixa os pacotes durante a instalação):
   https://www.debian.org/distrib/netinst — escolha "amd64".
2. Grave num pendrive (mínimo 2GB):
   - Windows/Mac: [balenaEtcher](https://etcher.balena.io/) — abre o `.iso`, escolhe o pendrive, grava.
   - Linux: `sudo dd if=debian-12.x.x-amd64-netinst.iso of=/dev/sdX bs=4M status=progress`
     (troque `/dev/sdX` pelo pendrive certo — confira com `lsblk` antes, `dd` no dispositivo
     errado apaga dados sem aviso).

## 2. Instalação do Debian (sem ambiente gráfico)

Boot pelo pendrive (pode precisar entrar no BIOS/boot menu do notebook — geralmente F12,
F9 ou Esc na tela de logo). Use a opção **"Install"** (modo texto), não a "Graphical Install"
— não muda o resultado final, mas é mais leve durante a instalação.

Durante o processo:
- Configure idioma, teclado, hostname (ex: `agenda-server`), usuário e senha normalmente.
- Particionamento: pode usar "guiado - disco inteiro" sem medo, é dedicado a isso.
- **Na tela "Seleção de software" (tasksel)**: desmarque **todos** os ambientes de
  desktop (GNOME, etc). Deixe marcado apenas:
  - [x] SSH server
  - [x] standard system utilities

Isso resulta numa instalação sem interface gráfica nenhuma — só terminal, exatamente o
que você quer.

## 3. Primeiro acesso

Depois de reiniciar, você pode:
- Usar o notebook direto (teclado/tela dele), ou
- Descobrir o IP dele (`ip a` no terminal do próprio notebook) e acessar via SSH de outro
  computador: `ssh seu_usuario@192.168.0.X` — recomendado, mais confortável pra copiar/colar
  comandos deste guia.

Atualize o sistema:
```bash
sudo apt update && sudo apt upgrade -y
```

## 4. Instalar o Node.js

Via repositório oficial NodeSource (traz uma versão LTS recente):
```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # confirme que instalou
```

## 5. Levar o projeto pro servidor

Opção mais simples — copiar via `scp` do seu computador atual (rode este comando no SEU
computador, não no servidor, apontando pro zip do projeto):
```bash
scp agenda-tablet.zip seu_usuario@192.168.0.X:~/
```

No servidor:
```bash
sudo apt install -y unzip
unzip agenda-tablet.zip
cd agenda-tablet
npm install
node server.js   # teste rápido — Ctrl+C depois de confirmar que funciona
```

Acesse `http://192.168.0.X:3000/display` de outro aparelho pra confirmar que está no ar
antes de seguir pro próximo passo.

## 6. Deixar rodando permanentemente (systemd)

Rodar com `node server.js` direto no terminal para assim que você fechar a sessão SSH. Pra
manter rodando sempre, mesmo depois de reiniciar o notebook, crie um serviço systemd:

```bash
sudo nano /etc/systemd/system/agenda-tablet.service
```

Cole (ajuste `seu_usuario` e o caminho se necessário):
```ini
[Unit]
Description=Agenda do Tablet
After=network.target

[Service]
Type=simple
User=seu_usuario
WorkingDirectory=/home/seu_usuario/agenda-tablet
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

Ative e inicie:
```bash
sudo systemctl daemon-reload
sudo systemctl enable agenda-tablet
sudo systemctl start agenda-tablet
sudo systemctl status agenda-tablet   # confirma "active (running)"
```

A partir de agora, o serviço:
- Inicia sozinho quando o notebook liga
- Reinicia sozinho se o processo travar/cair (`Restart=always`)

Pra ver os logs quando precisar debugar:
```bash
journalctl -u agenda-tablet -f
```

## 7. Impedir que o notebook durma ao fechar a tampa

Isso é importante — por padrão, fechar a tampa de um notebook Linux suspende o sistema,
o que derrubaria o servidor. Edite:
```bash
sudo nano /etc/systemd/logind.conf
```
Encontre (ou adicione) e ajuste estas linhas:
```ini
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
```
Salve e reinicie o serviço:
```bash
sudo systemctl restart systemd-logind
```
Agora pode fechar a tampa sem medo — o notebook continua rodando (deixe ele sempre na
tomada; a bateria de um notebook desse tempo provavelmente já não seguraria carga suficiente
sozinha por muito tempo).

## 8. Religar sozinho após queda de energia (opcional, recomendado)

Entre no BIOS do notebook (tecla no boot, geralmente F2/Del) e procure uma opção do tipo
**"Restore on AC Power Loss"** ou **"After Power Failure"**, e configure como **"Power On"**
(ou "Last State"). Assim, se faltar luz em casa, o notebook liga sozinho quando a energia
voltar, sem você precisar apertar o botão manualmente. Nem todo BIOS de notebook antigo tem
essa opção — se não encontrar, sem problema, só significa que você vai precisar ligar
manualmente depois de uma queda de energia.

## 9. IP fixo na rede

Reserve um IP fixo pra esse notebook no seu roteador (DHCP reservation, baseado no endereço
MAC dele — geralmente em Configurações do roteador > DHCP > Reservas). Assim o tablet, o
celular e o painel admin sempre apontam pro mesmo endereço, mesmo depois de reiniciar o
roteador ou o notebook.

Pra descobrir o MAC do notebook: `ip link show` (procure a interface `eth0` ou `wlan0`,
o endereço no formato `xx:xx:xx:xx:xx:xx`).

## 10. Firewall básico (opcional, mas recomendado)

Já que esse notebook vai ficar ligado o tempo todo na rede:
```bash
sudo apt install -y ufw
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 3000/tcp    # a agenda
sudo ufw enable
```

## Checklist final

- [ ] `systemctl status agenda-tablet` mostra "active (running)"
- [ ] Tablet acessando `/display` normalmente
- [ ] Celular/PC acessando `/admin` e `/control`
- [ ] Fechar a tampa do notebook não derruba o serviço
- [ ] IP reservado no roteador
- [ ] (Se aplicável) BIOS configurado pra religar após queda de energia
