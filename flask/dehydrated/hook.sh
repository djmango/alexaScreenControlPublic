#!/usr/bin/env bash
set -e
set -u
set -o pipefail

domain="thisisnotatest"
token="cb1c0455-1db8-468f-af48-429d955a95a2"

case "$1" in
"deploy_challenge")
    curl "https://www.duckdns.org/update?domains=$domain&token=$token&txt=$4"
    echo
    ;;
"clean_challenge")
    curl "https://www.duckdns.org/update?domains=$domain&token=$token&txt=removed&clear=true"
    echo
    ;;
"unchanged_cert") ;;

"startup_hook") ;;

"exit_hook") ;;

*)
    echo Unknown hook "${1}"
    exit 0
    ;;
esac
