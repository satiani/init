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

mkdir $HOME/vimswap

for i in $(cd $SCRIPT_DIR/..; pwd)/.*; do
    if [[ $i = *"git"* ]]; then
        continue
    fi

    home_path=$HOME/`basename $i`
    if [ -f $home_path -o -L $home_path ]; then
        mv $home_path ${home_path}.old;
    fi;
    ln -sv $i $HOME
done

git config --global user.name "Samer Atiani"
git config --global user.email "satiani@gmail.com"
git config --global color.ui auto
git config --global alias.st status
