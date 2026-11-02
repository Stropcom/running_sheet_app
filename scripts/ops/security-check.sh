#!/usr/bin/env bash
# RunLog server security check — READ ONLY.
#
# Looks at the droplet and prints what it finds, so the "not covered" list in the
# security inventory can be answered. It changes nothing: no installs, no
# restarts, no edits, no deletes. It never prints a password, key or the
# contents of the .env file (only which variables are set, and the length of the
# secrets). The only file it writes is the optional report file you name.
#
# Run it on the droplet, as root so it can read firewall and web server settings:
#
#   sudo bash scripts/ops/security-check.sh
#   sudo bash scripts/ops/security-check.sh --app-dir /opt/runlog --domain runlog.com.au
#   sudo bash scripts/ops/security-check.sh --out ~/security-report.txt
#
# Then paste the whole output (or the report file) back. Lines are marked:
#   [OK]     looks fine        [CHECK]  worth a look        [INFO]  just a fact
#   [NOPE]   could not read it (usually needs sudo)

set -u
export LC_ALL=C

APP_DIR="/opt/runlog"
DOMAIN=""
OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --app-dir) APP_DIR="${2:-}"; shift 2 ;;
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    -h|--help) sed -n 2,22p "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (use --help)"; exit 2 ;;
  esac
done

if [ -n "$OUT" ]; then
  exec > >(tee "$OUT") 2>&1
fi

IS_ROOT=0
[ "$(id -u)" -eq 0 ] && IS_ROOT=1

have() { command -v "$1" >/dev/null 2>&1; }
ok() { printf '  [OK]    %s\n' "$*"; }
chk() { printf '  [CHECK] %s\n' "$*"; }
inf() { printf '  [INFO]  %s\n' "$*"; }
nope() { printf '  [NOPE]  %s\n' "$*"; }
sec() { printf '\n== %s ==\n' "$*"; }
indent() { sed 's/^/          /'; }

printf 'RunLog security check (read only)\n'
printf 'Run at: %s   As user: %s   Root: %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$(id -un)" "$([ $IS_ROOT -eq 1 ] && echo yes || echo no)"
[ $IS_ROOT -eq 1 ] || chk "Not run as root: firewall, nginx and some SSH checks will say NOPE. Re-run with sudo for the full picture."

# ───────────────────────────────────────────────────────────────────────────────
sec "1. The machine"
[ -r /etc/os-release ] && inf "OS: $(. /etc/os-release; echo "${PRETTY_NAME:-unknown}")"
inf "Kernel: $(uname -r)"
inf "Uptime: $(uptime -p 2>/dev/null || uptime)"
if [ -f /var/run/reboot-required ]; then chk "A reboot is waiting (kernel or library update installed but not yet running)"; else ok "No reboot waiting"; fi
if have apt-get; then
  UPG="$(apt list --upgradable 2>/dev/null | grep -vc '^Listing' )"
  SECUPG="$(apt-get -s upgrade 2>/dev/null | grep -ci '^Inst.*security')"
  if [ "${SECUPG:-0}" -gt 0 ]; then chk "$SECUPG security updates are waiting to be installed"; else ok "No security updates waiting"; fi
  inf "All upgradable packages: ${UPG:-0}"
fi
if have systemctl; then
  if systemctl is-enabled unattended-upgrades >/dev/null 2>&1; then ok "Automatic security updates (unattended-upgrades) are enabled"; else chk "Automatic security updates (unattended-upgrades) are not enabled"; fi
fi
inf "Disk: $(df -h / | awk 'NR==2{print $3" used of "$2" ("$5")"}')"
if have lsblk; then
  if lsblk -f 2>/dev/null | grep -qi crypto_LUKS; then ok "A disk is LUKS-encrypted"; else inf "No LUKS disk encryption found (normal on a DigitalOcean droplet; the data is not encrypted at rest on this machine)"; fi
fi

# ───────────────────────────────────────────────────────────────────────────────
sec "2. Who can get in: SSH and accounts"
SSHD_CONF=""
if have sshd && [ $IS_ROOT -eq 1 ]; then SSHD_CONF="$(sshd -T 2>/dev/null)"; fi
if [ -n "$SSHD_CONF" ]; then
  getv() { printf '%s\n' "$SSHD_CONF" | awk -v k="$1" 'tolower($1)==k{ $1=""; sub(/^ /,""); print; exit }'; }
  v="$(getv permitrootlogin)"; case "$v" in no) ok "Root login over SSH: no";; *) chk "Root login over SSH: ${v:-unknown}";; esac
  v="$(getv passwordauthentication)"; case "$v" in no) ok "SSH password login: off (keys only)";; *) chk "SSH password login: ${v:-unknown} (keys only is safer)";; esac
  v="$(getv pubkeyauthentication)"; inf "SSH key login: ${v:-unknown}"
  v="$(getv port)"; inf "SSH port: ${v:-unknown}"
  v="$(getv maxauthtries)"; inf "SSH max auth tries: ${v:-unknown}"
  v="$(getv allowusers)"; inf "SSH AllowUsers: ${v:-not set}"
  v="$(getv x11forwarding)"; inf "SSH X11 forwarding: ${v:-unknown}"
else
  nope "Effective SSH settings (needs sudo). Reading the config files instead:"
  grep -HEi '^\s*(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|Port|AllowUsers|MaxAuthTries)\b' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | indent
fi
inf "Accounts with a login shell:"
awk -F: '$7 !~ /(nologin|false|sync|shutdown|halt)$/ && $7 != "" {print $1" (uid "$3", shell "$7")"}' /etc/passwd | indent
if have getent; then
  for g in sudo admin wheel; do
    m="$(getent group "$g" 2>/dev/null | cut -d: -f4)"
    [ -n "$m" ] && inf "Members of '$g' (can become root): $m"
  done
fi
if [ $IS_ROOT -eq 1 ]; then
  inf "SSH keys that can log in (count per account; fingerprints and comments):"
  for h in /root /home/*; do
    f="$h/.ssh/authorized_keys"
    [ -f "$f" ] || continue
    n="$(grep -cvE '^\s*(#|$)' "$f")"
    printf '          %s: %s key(s)\n' "$h" "$n"
    ssh-keygen -lf "$f" 2>/dev/null | sed 's/^/            /'
  done
else
  nope "Which SSH keys exist (needs sudo)"
fi
inf "Last 8 successful logins:"
last -n 8 -w 2>/dev/null | head -8 | indent
if [ $IS_ROOT -eq 1 ] && have lastb; then
  FB="$(lastb 2>/dev/null | grep -vc '^$\|btmp begins')"
  inf "Failed login records on file: ${FB:-0}"
fi
if have fail2ban-client; then
  if fail2ban-client status >/dev/null 2>&1; then ok "fail2ban is running"; fail2ban-client status 2>/dev/null | indent; else chk "fail2ban is installed but not running or not readable"; fi
else
  chk "fail2ban is not installed (nothing slows repeated SSH password guessing except key-only login)"
fi

# ───────────────────────────────────────────────────────────────────────────────
sec "3. Firewall and open ports"
if have ufw; then
  if [ $IS_ROOT -eq 1 ]; then
    UFW="$(ufw status verbose 2>/dev/null)"
    if printf '%s' "$UFW" | grep -q 'Status: active'; then UFWACTIVE=1; ok "ufw firewall is active"; else chk "ufw firewall is installed but NOT active"; fi
    printf '%s\n' "$UFW" | indent
  else nope "ufw status (needs sudo)"; fi
else
  chk "ufw is not installed (the DigitalOcean cloud firewall, if you use one, is not visible from the server: check its page in the control panel)"
fi
if [ $IS_ROOT -eq 1 ] && have iptables; then inf "iptables rules in INPUT chain: $(iptables -S INPUT 2>/dev/null | wc -l)"; fi
inf "Everything listening for connections (address:port, process):"
if have ss; then ss -H -tulpn 2>/dev/null | awk '{print $1" "$5" "$7}' | sort -u | indent; fi
if have ss; then
  EXPOSED="$(ss -H -tuln 2>/dev/null | awk '{print $5}' | grep -E '^(0\.0\.0\.0|\[::\]|\*):' | sed 's/.*://' | sort -un | tr '\n' ' ')"
  inf "Ports open on ALL addresses: ${EXPOSED:-none}"
  for p in $EXPOSED; do
    case "$p" in 22|80|443|3000|3306|3307|5432|6379|27017) ;; *) chk "Port $p is listening on every address: confirm it is meant to be reachable from the internet and is covered by the firewall" ;; esac
  done
  for p in 3000 3306 3307 5432 6379 27017; do
    if ss -H -tuln 2>/dev/null | awk '{print $5}' | grep -qE "^(0\.0\.0\.0|\[::\]|\*):$p$"; then
      if [ "${UFWACTIVE:-0}" = "1" ] && ! ufw status 2>/dev/null | grep -qE "^$p(/|[[:space:]])"; then
        chk "Port $p listens on all addresses but the firewall does not allow it in: safe today, yet it should listen on 127.0.0.1 only so one firewall mistake cannot expose it"
      else
        chk "Port $p is open on all addresses (app/database ports should be localhost only)"
      fi
    fi
  done
fi

# ───────────────────────────────────────────────────────────────────────────────
sec "4. Web server (nginx) and TLS"
if have nginx; then
  inf "nginx: $(nginx -v 2>&1)"
  NG=""
  if [ $IS_ROOT -eq 1 ]; then NG="$(nginx -T 2>/dev/null | grep -vE '^\s*#')"; fi
  if [ -n "$NG" ]; then
    printf '%s\n' "$NG" | grep -E '^\s*(server_name|listen|return 301|ssl_protocols|ssl_ciphers|server_tokens|client_max_body_size|limit_req|limit_conn|add_header|proxy_pass|ssl_certificate |ssl_stapling|ssl_prefer_server_ciphers)\b' | sed 's/^\s*/          /' | sort -u
    LASTPROTO="$(printf '%s\n' "$NG" | grep -E '^\s*ssl_protocols' | tail -1)"
    if printf '%s' "$LASTPROTO" | grep -qE 'TLSv1[ ;]|TLSv1\.1'; then chk "The last ssl_protocols line allows TLS 1.0/1.1: $LASTPROTO"; else ok "The ssl_protocols line that applies allows TLS 1.2 and 1.3 only (several lines are listed above; the later one, from the server block, wins)"; fi
    printf '%s\n' "$NG" | grep -qE '^\s*server_tokens\s+off' && ok "nginx is set to hide its version" || chk "nginx does not hide its version (add server_tokens off; in nginx.conf)"
    printf '%s\n' "$NG" | grep -qE 'return 301 https' && ok "HTTP is redirected to HTTPS" || chk "No HTTP to HTTPS redirect found in the nginx config"
    printf '%s\n' "$NG" | grep -qE 'limit_req' && ok "nginx request rate limiting is configured" || inf "No nginx rate limiting (the app limits sign-in attempts itself)"
    printf '%s\n' "$NG" | grep -qE 'client_max_body_size' && inf "Upload size limit is set in nginx" || chk "client_max_body_size not set in nginx (the default is 1 MB: uploads of photos need it raised; the app caps a photo at 25 MB)"
  else
    nope "nginx settings (needs sudo)"
  fi
else
  inf "nginx is not installed on this machine (something else may be in front of the app)"
fi
if [ -z "$DOMAIN" ] && [ -n "${NG:-}" ]; then
  DOMAIN="$(printf '%s\n' "$NG" | awk '/server_name/{gsub(";","",$2); if($2!="_" && $2!="localhost"){print $2; exit}}')"
fi
if [ -n "$DOMAIN" ] && have openssl; then
  inf "Checking the certificate and TLS for $DOMAIN (from this server)"
  S="$(echo | timeout 10 openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null)"
  if [ -n "$S" ]; then
    printf '%s\n' "$S" | grep -E 'Protocol|Cipher    :|Cipher is|Verification' | head -4 | indent
    CERT="$(printf '%s\n' "$S" | openssl x509 -noout -subject -issuer -dates 2>/dev/null)"
    [ -n "$CERT" ] && printf '%s\n' "$CERT" | indent
    END="$(printf '%s\n' "$S" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
    if [ -n "$END" ]; then
      DAYS=$(( ( $(date -d "$END" +%s) - $(date +%s) ) / 86400 ))
      if [ "$DAYS" -lt 21 ]; then chk "Certificate expires in $DAYS days"; else ok "Certificate expires in $DAYS days"; fi
    fi
    for v in tls1 tls1_1; do
      if echo | timeout 8 openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" -"$v" 2>&1 | grep -q 'Cipher is [A-Z0-9]'; then chk "Old protocol $v is accepted"; else ok "Old protocol $v is refused (or not testable here)"; fi
    done
  else nope "Could not connect to $DOMAIN:443 from this server"; fi
  H="$(timeout 10 curl -sSI "https://$DOMAIN/" 2>/dev/null)"
  if [ -n "$H" ]; then
    for hdr in Strict-Transport-Security X-Content-Type-Options X-Frame-Options Referrer-Policy Content-Security-Policy Permissions-Policy; do
      if printf '%s' "$H" | grep -qi "^$hdr:"; then ok "Header sent: $hdr"; else chk "Header NOT sent: $hdr"; fi
    done
    SRV="$(printf '%s' "$H" | grep -iE '^(server|x-powered-by):' | tr -d '\r')"
    [ -n "$SRV" ] && printf '%s\n' "$SRV" | indent
    printf '%s' "$SRV" | grep -qE '[0-9]+\.[0-9]+' && chk "The Server header shows a version number (set server_tokens off;)"
  fi
else
  inf "No domain given or found: re-run with --domain runlog.com.au to check the certificate and headers"
fi
if have systemctl; then
  systemctl list-timers 2>/dev/null | grep -qi certbot && ok "A certbot renewal timer exists" || inf "No certbot timer found (certificate renewal may be done another way)"
fi

# ───────────────────────────────────────────────────────────────────────────────
sec "5. The app and its secrets"
if [ -d "$APP_DIR" ]; then
  inf "App folder: $APP_DIR (owner $(stat -c '%U:%G' "$APP_DIR"), mode $(stat -c '%a' "$APP_DIR"))"
  [ -f "$APP_DIR/package.json" ] && inf "Version: $(grep -m1 '"version"' "$APP_DIR/package.json" | sed 's/[^0-9.]//g')"
  if have git && [ -d "$APP_DIR/.git" ]; then
    inf "Branch: $(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null), commit $(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null)"
    DIRTYLIST="$(git -C "$APP_DIR" status --porcelain 2>/dev/null)"
    if [ -n "$DIRTYLIST" ]; then
      chk "$(printf '%s\n' "$DIRTYLIST" | wc -l) file(s) differ from the commit (M = edited and reset by a deploy; ?? = untracked, left alone):"
      printf '%s\n' "$DIRTYLIST" | head -12 | indent
    else ok "App folder matches the commit (no loose edits)"; fi
  fi
  ENVF="$APP_DIR/.env"
  if [ -f "$ENVF" ]; then
    perm="$(stat -c '%a' "$ENVF")"; own="$(stat -c '%U:%G' "$ENVF")"
    inf ".env file: owner $own, mode $perm"
    case "$perm" in 600|400|640|440) ok ".env is not readable by everyone" ;; *) chk ".env is readable by other accounts (mode $perm): tighten to 600" ;; esac
    if [ -r "$ENVF" ]; then
      setvars="$(grep -E '^[A-Z][A-Z0-9_]*=' "$ENVF" | cut -d= -f1 | tr '\n' ' ')"
      inf "Variables set (names only): $setvars"
      len() { grep -E "^$1=" "$ENVF" | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//' | tr -d '\n' | wc -c; }
      jl="$(len JWT_SECRET)"; if [ "$jl" -ge 32 ]; then ok "JWT_SECRET is set ($jl characters)"; else chk "JWT_SECRET is missing or short ($jl characters; needs 32 or more)"; fi
      wl="$(len WIPC_VAULT_KEY)"; if [ "$wl" -eq 64 ]; then ok "WIPC_VAULT_KEY is set (64 characters)"; elif [ "$wl" -eq 0 ]; then inf "WIPC_VAULT_KEY is not set (the WIPC vault is then unavailable)"; else chk "WIPC_VAULT_KEY has $wl characters (must be 64)"; fi
      db="$(grep -E '^DATABASE_URL=' "$ENVF" | head -1 | cut -d= -f2- | sed -E 's#^["'\'']?[a-z0-9+]+://[^@]*@##; s#[/?].*$##; s#["'\'']$##')"
      [ -n "$db" ] && inf "Database address the app uses (credentials hidden): $db"
      case "$db" in
        localhost*|127.0.0.1*|"[::1]"*) ok "The app talks to a database on this machine" ;;
        "") ;;
        *ondigitalocean.com*) inf "The app uses a DigitalOcean managed database. In the control panel confirm: Trusted sources lists only this droplet, 'Require SSL' is on, and daily backups are on. Note the app does not verify the database's certificate (rejectUnauthorized is false in server/db/core.ts)." ;;
        *) chk "The database is on another host ($db): confirm the link is private and encrypted" ;;
      esac
      echo "$db" | grep -qE '^private-' && ok "The database address is the private (VPC) one" || true
      bad="$(grep -E '^[A-Z]{1,4}=' "$ENVF" | cut -d= -f1 | grep -vxE 'PORT|NODE_ENV|TZ' | tr '\n' ' ')"
      [ -n "$bad" ] && chk "Unexpected short variable name(s) in .env: $bad (a typo such as ORT for PORT?)"
      grep -qE '^NODE_ENV=.?production' "$ENVF" && ok "NODE_ENV is production" || inf "NODE_ENV is not set to production in .env (it may be set by pm2 instead)"
    else nope "Reading .env (needs sudo); only the file permissions are shown"; fi
  else
    inf "No .env file at $ENVF (the secrets may be set another way, for example in pm2)"
  fi
  for d in "$APP_DIR/uploads" "$APP_DIR/local-uploads"; do
    [ -d "$d" ] && inf "Uploads folder $d: owner $(stat -c '%U:%G' "$d"), mode $(stat -c '%a' "$d"), size $(du -sh "$d" 2>/dev/null | cut -f1)"
  done
else
  nope "App folder $APP_DIR not found (use --app-dir)"
fi
inf "App process (who runs it):"
APPPS="$(ps -eo user:14,pid,args 2>/dev/null | grep -E '[d]ist/index\.js|[s]erver/_core/index' | cut -c1-150)"
if [ -n "$APPPS" ]; then printf '%s\n' "$APPPS" | indent; else chk "No RunLog app process found (not running, or started under another command)"; fi
ps -eo user:14,args 2>/dev/null | grep -E '[d]ist/index\.js|[s]erver/_core/index' | awk '{print $1}' | grep -qx root && chk "The app runs as root: run it as a normal account"
if have pm2; then inf "pm2 processes:"; pm2 jlist 2>/dev/null | grep -o '"name":"[^"]*"\|"status":"[^"]*"\|"pm_uptime":[0-9]*' | paste -sd' ' | indent; fi
inf "Health check from this server:"
HC="$(timeout 5 curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/healthz 2>/dev/null)"
if [ "$HC" = "200" ]; then ok "/healthz on port 3000 answered 200"; else chk "/healthz on port 3000 answered ${HC:-nothing} (app not running, or on another port)"; fi

# ───────────────────────────────────────────────────────────────────────────────
sec "6. The database"
for svc in mysql mysqld mariadb; do
  if have systemctl && systemctl is-active "$svc" >/dev/null 2>&1; then inf "Database service running: $svc"; DBSVC="$svc"; fi
done
if have ss; then
  ss -H -tlnp 2>/dev/null | awk '$5 ~ /:(3306|3307)$/ {print "          listening on "$5}'
  if ss -H -tln 2>/dev/null | awk '{print $5}' | grep -qE '^(0\.0\.0\.0|\[::\]|\*):(3306|3307)$'; then chk "The database accepts connections from outside this machine (bind-address is not localhost)"; else ok "The database is not listening on a public address"; fi
fi
grep -HEi '^\s*(bind-address|skip-networking|require_secure_transport|ssl|local_infile)\b' /etc/mysql/*.cnf /etc/mysql/*/*.cnf /etc/my.cnf /etc/my.cnf.d/*.cnf 2>/dev/null | indent

# ───────────────────────────────────────────────────────────────────────────────
sec "7. Backups"
SEENB=" "
for B in "$HOME/backups" "/root/backups" "/home/*/backups" "$APP_DIR/backups" /var/backups/runlog; do
  for d in $B; do
    [ -d "$d" ] || continue
    case "$SEENB" in *" $d "*) continue ;; esac
    SEENB="$SEENB$d "
    inf "Backup folder: $d (owner $(stat -c '%U:%G' "$d"), mode $(stat -c '%a' "$d"))"
    case "$(stat -c '%a' "$d")" in *[1-7]) chk "Backup folder is accessible to other accounts" ;; esac
    ls -lt --time-style=long-iso "$d" 2>/dev/null | head -8 | indent
    newest="$(find "$d" -maxdepth 1 -type f -printf '%T@\n' 2>/dev/null | sort -nr | head -1)"
    if [ -n "$newest" ]; then
      age=$(( ( $(date +%s) - ${newest%.*} ) / 86400 ))
      [ "$age" -gt 7 ] && chk "Newest backup is $age days old" || ok "Newest backup is $age day(s) old"
    fi
    n="$(find "$d" -maxdepth 1 -type f 2>/dev/null | wc -l)"
    [ "$(find "$d" -maxdepth 1 -type f -perm /004 2>/dev/null | wc -l)" -gt 0 ] && chk "Backup files are readable by every account on the server (should be mode 600)"
    [ "$n" -gt 30 ] && chk "$n backup files and no clean-up: they pile up (keep the newest 14 or so)"
    inf "Files in the folder: $n; total size $(du -sh "$d" 2>/dev/null | cut -f1)"
    find "$d" -maxdepth 1 -type f \( -name '*.gpg' -o -name '*.enc' -o -name '*.age' \) 2>/dev/null | grep -q . && ok "Some backups look encrypted" || chk "Backups look like plain files (not encrypted) and sit on this server's own disk"
  done
done
if [ $IS_ROOT -eq 1 ]; then
  inf "Scheduled jobs that may copy backups off the server:"
  { crontab -l 2>/dev/null; ls /etc/cron.d 2>/dev/null; } | grep -v '^#' | indent
fi
have systemctl && { systemctl is-active do-agent >/dev/null 2>&1 && ok "DigitalOcean monitoring agent (do-agent) is running" || inf "do-agent is not running (droplet CPU/disk graphs and alerts may not work)"; }

# ───────────────────────────────────────────────────────────────────────────────
sec "8. Logging"
have journalctl && inf "System journal size: $(journalctl --disk-usage 2>/dev/null | sed 's/.*take up //; s/ on disk.*//')"
[ -d /var/log/journal ] && ok "Journal is kept across reboots" || inf "Journal is not persistent across reboots (logs vanish when the server restarts)"
have auditd && inf "auditd is installed" || inf "auditd is not installed (no kernel-level record of who changed what on the server)"
[ -d "$HOME/.pm2/logs" ] && inf "pm2 logs: $(du -sh "$HOME/.pm2/logs" 2>/dev/null | cut -f1)"

printf '\nDone. Nothing was changed. Paste this whole output back.\n'
