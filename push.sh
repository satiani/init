#!/bin/bash

set -e

cd `dirname $0`
git add .
git commit -am 'push.sh'
git push origin
