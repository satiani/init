#!/bin/bash

SCRIPT_DIR=$(cd `dirname $0` && pwd)
export VIRTUAL_ENV=$1
$SCRIPT_DIR/venv/bin/pyls
