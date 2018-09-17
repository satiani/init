#!/bin/bash

SCRIPT_DIR=$(cd `dirname $0` && pwd)
node $SCRIPT_DIR/node_modules/ternjs/bin/tern $*
