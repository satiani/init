#!/bin/bash

set -e
cd `dirname $0`
if ! git diff-index --quiet HEAD; then
    git stash
    STASHED=1
fi
git pull --rebase
[ -z $STASHED ] || git stash pop
