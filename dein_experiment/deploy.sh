#!/bin/bash

SCRIPT_DIR=$(cd `dirname $0` && pwd)

# install rust
curl https://sh.rustup.rs -sSf | sh
export PATH=~/.cargo/bin/:$PATH
cargo install ripgrep
ln -sv $SCRIPT_DIR/.vimrc $HOME
ln -sv $SCRIPT_DIR/.vim $HOME
