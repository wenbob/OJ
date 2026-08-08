#!/bin/sh
set -eu

# Certbot runs deploy hooks only after a certificate was renewed successfully.
# Refuse to reload a broken configuration and keep the currently loaded Nginx
# workers serving traffic if validation fails.
/usr/sbin/nginx -t
/bin/systemctl reload nginx
