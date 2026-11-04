#!/usr/bin/env bash
# Shared loader for the ops scripts: reads the ops env file and applies each KEY=VALUE
# only when that variable is not already set, so a real environment variable always
# wins over the file (which is what makes one-off overrides such as
# DS_HEALTH_URL=http://... usable for drills).
#
# Ops env lookup order: $DS_OPS_ENV, ~/.config/dialog-survey-ops.env,
# /etc/default/dialog-survey-ops (also read by the systemd units).
# Values are literal — do not quote them, do not use command substitution.
DS_OPS_ENV="${DS_OPS_ENV:-$HOME/.config/dialog-survey-ops.env}"
if [ ! -f "$DS_OPS_ENV" ]; then
  DS_OPS_ENV=/etc/default/dialog-survey-ops
fi
if [ -f "$DS_OPS_ENV" ]; then
  while IFS= read -r _ds_line || [ -n "$_ds_line" ]; do
    case "$_ds_line" in ''|[\ \#]*) continue ;; esac
    _ds_key="${_ds_line%%=*}"
    _ds_val="${_ds_line#*=}"
    [ "$_ds_key" = "$_ds_line" ] && continue          # no '=' on this line
    case "$_ds_key" in *[!A-Za-z0-9_]*|*[0-9]*) continue ;; esac
    if [ -z "${!_ds_key:-}" ]; then
      export "$_ds_key=$_ds_val"
    fi
  done < "$DS_OPS_ENV"
  unset _ds_line _ds_key _ds_val
fi
