#!/bin/bash

set -e
cd `dirname $0`
git stash
git pull --rebase
git stash pop
