#!/bin/sh
set -eu

env_path="${1:-/www/oj/.env}"

if [ ! -f "$env_path" ]; then
    echo "Environment file not found: $env_path" >&2
    exit 1
fi

case "$env_path" in
    /www/oj/.env|/www/oj-new/.env) ;;
    *)
        echo "Refusing to edit an unexpected environment path: $env_path" >&2
        exit 1
        ;;
esac

stamp="$(date +%Y%m%d-%H%M%S)"
backup_path="${env_path}.before-domain-sync-${stamp}"
temporary_path="$(mktemp "${env_path}.tmp.XXXXXX")"

cleanup() {
    rm -f -- "$temporary_path"
}
trap cleanup EXIT HUP INT TERM

cp -p -- "$env_path" "$backup_path"
chmod 600 "$backup_path"

awk '
    !/^(APP_ORIGIN|SESSION_COOKIE_SECURE|OJ_LISTEN_HOST|NEXT_PUBLIC_SITE_URL)=/
' "$env_path" > "$temporary_path"

printf '\nAPP_ORIGIN=https://botcode.work\n' >> "$temporary_path"
printf 'SESSION_COOKIE_SECURE=true\n' >> "$temporary_path"
printf 'OJ_LISTEN_HOST=127.0.0.1\n' >> "$temporary_path"

chown --reference="$env_path" "$temporary_path"
chmod --reference="$env_path" "$temporary_path"
mv -- "$temporary_path" "$env_path"
trap - EXIT HUP INT TERM

echo "Updated $env_path"
echo "Backup: $backup_path"
