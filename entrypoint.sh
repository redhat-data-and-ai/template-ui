#!/bin/bash

# Custom CA support: mount a PEM file or provide a URL.
#   CUSTOM_CA_PATH — path to a mounted PEM file (preferred, no network call)
#   CUSTOM_CA_URL  — URL to download PEM from (fallback, hits network per pod)
CA_PEM=""

if [ -n "$CUSTOM_CA_PATH" ] && [ -f "$CUSTOM_CA_PATH" ]; then
  CA_PEM="$CUSTOM_CA_PATH"
elif [ -n "$CUSTOM_CA_URL" ]; then
  case "$CUSTOM_CA_URL" in
    https://*) ;;
    *) echo "ERROR: CUSTOM_CA_URL must use https://" >&2; exec "$@" ;;
  esac
  CA_URL_REDACTED="${CUSTOM_CA_URL%%\?*}"
  if curl -fso /tmp/custom-ca.pem "$CUSTOM_CA_URL"; then
    CA_PEM="/tmp/custom-ca.pem"
    echo "INFO: Successfully fetched CA from $CA_URL_REDACTED" >&2
  else
    echo "WARN: Failed to fetch CA from $CA_URL_REDACTED, continuing with defaults" >&2
  fi
fi

if [ -n "$CA_PEM" ]; then
  BUNDLE_PATH="/tmp/.ca-bundle.pem"

  if [ -f /etc/pki/tls/certs/ca-bundle.crt ]; then
    cp /etc/pki/tls/certs/ca-bundle.crt "$BUNDLE_PATH"
  elif [ -f /etc/ssl/certs/ca-certificates.crt ]; then
    cp /etc/ssl/certs/ca-certificates.crt "$BUNDLE_PATH"
  else
    touch "$BUNDLE_PATH"
  fi

  chmod u+w "$BUNDLE_PATH"
  cat "$CA_PEM" >> "$BUNDLE_PATH"
  [ "$CA_PEM" = "/tmp/custom-ca.pem" ] && rm -f /tmp/custom-ca.pem

  export NODE_EXTRA_CA_CERTS="$BUNDLE_PATH"

  # Let ldap-client.ts pick up the same bundle when LDAP_CA_CERT is unset
  if [ -z "$LDAP_CA_CERT" ]; then
    export LDAP_CA_CERT="$BUNDLE_PATH"
  fi

  echo "INFO: Custom CA bundle configured at $BUNDLE_PATH" >&2
fi

exec "$@"
