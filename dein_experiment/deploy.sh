#!/bin/bash

SCRIPT_DIR=$(cd `dirname $0` && pwd)

# install rust
curl http://sh.rustup.rs -sSf | sh
export PATH=~/.cargo/bin/:$PATH

# install ripgrep using rust package manager
cargo install ripgrep

# install dein
source $SCRIPT_DIR/lib.sh
install_dein ~/.cache/dein

# symbolic links
ln -sv $SCRIPT_DIR/.vimrc $HOME
ln -sv $SCRIPT_DIR/.vim $HOME
