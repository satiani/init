#!/bin/bash

# configure git {{{
git config --global user.name "Samer Atiani"
git config --global user.email "satiani@gmail.com"
git config --global color.ui auto
git config --global alias.st status
git config --global push.default simple
git config --global mergetool.nvimdiff.cmd 'nvim -f -c "Gdiff" "$MERGED"'
git config --global merge.tool nvimdiff
# }}}
echo "Done"
