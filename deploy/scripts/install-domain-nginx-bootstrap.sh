#!/bin/sh
set -eu

final_config="${1:-/tmp/oj-domain-final.conf}"
active_config="/etc/nginx/sites-available/oj"
manual_certificate="/etc/nginx/ssl/botcode.work/botcode.work.pem"
manual_private_key="/etc/nginx/ssl/botcode.work/botcode.work.key"

for required_file in \
    "$final_config" \
    "$active_config" \
    "$manual_certificate" \
    "$manual_private_key"
do
    if [ ! -f "$required_file" ]; then
        echo "Required file not found: $required_file" >&2
        exit 1
    fi
done

stamp="$(date +%Y%m%d-%H%M%S)"
backup_config="${active_config}.before-domain-bootstrap-${stamp}"
candidate_config="$(mktemp /tmp/oj-domain-bootstrap.XXXXXX.conf)"

cleanup() {
    rm -f -- "$candidate_config"
}
trap cleanup EXIT HUP INT TERM

cp -p -- "$active_config" "$backup_config"
mkdir -p /var/www/certbot/.well-known/acme-challenge

sed \
    -e "s#/etc/letsencrypt/live/botcode.work/fullchain.pem#${manual_certificate}#g" \
    -e "s#/etc/letsencrypt/live/botcode.work/privkey.pem#${manual_private_key}#g" \
    "$final_config" > "$candidate_config"

cp -- "$candidate_config" "$active_config"
chmod --reference="$backup_config" "$active_config"
if ! /usr/sbin/nginx -t; then
    cp -- "$backup_config" "$active_config"
    /usr/sbin/nginx -t
    echo "Nginx validation failed; restored $backup_config" >&2
    exit 1
fi

if ! /bin/systemctl reload nginx; then
    cp -- "$backup_config" "$active_config"
    /usr/sbin/nginx -t
    /bin/systemctl reload nginx
    echo "Nginx reload failed; restored $backup_config" >&2
    exit 1
fi

echo "Installed ACME-ready domain configuration"
echo "Backup: $backup_config"
