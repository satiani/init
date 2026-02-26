#!/bin/bash
# vim:foldmethod=marker
# Preamble {{{
set -e

SCRIPT_DIR=$(cd `dirname $0` && pwd)
ON_A_MAC=`([ $( uname ) == "Darwin" ] && echo "true") || echo "false"`
source $SCRIPT_DIR/common.sh
# }}}
# Requirements test {{{
test_required_commands zsh curl git tmux rsync cmake
# }}}
# bin dir {{{
export PATH=~/.local/bin:~/.cargo/bin:~/.fzf/bin:/usr/local/bin:/usr/bin:$PATH:~/bin
# }}}
# oh my zsh {{{
if ! [ -d ~/.oh-my-zsh ]; then
    git clone https://github.com/ohmyzsh/ohmyzsh.git ~/.oh-my-zsh
    ln -sv $SCRIPT_DIR/lscolors.zsh ~/.oh-my-zsh/custom
else
    echo "Skipping oh-my-zsh."
fi
# }}}
# rust/cargo {{{
if ! [ -x "$(command -v cargo)" ]; then
    curl https://sh.rustup.rs -sSf | sh
else
    echo "Skipping rust/cargo."
fi
# }}}
# ripgrep {{{
if ! [ -x "$(command -v rg)" ]; then
    cargo install ripgrep
else
    echo "Skipping ripgrep."
fi
if ! [ -e ~/.config/starship.toml ]; then
    mkdir -p ~/.config/
    ln -sv $SCRIPT_DIR/starship.toml ~/.config
else
    echo "Skipping starship config."
fi
# }}}
# starship {{{
if ! [ -x "$(command -v starship)" ]; then
    cargo install starship
else
    echo "Skipping starship."
fi
# }}}
# fzf {{{
if ! [ -x "$(command -v fzf)" ]; then
    git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf
    ~/.fzf/install --key-bindings --completion --no-update-rc
else
    echo "Skipping fzf."
fi
# }}}
# zoxide {{{
if ! [ -x "$(command -v zoxide)" ]; then
    cargo install zoxide --locked
else
    echo "Skipping zoxide."
fi
# }}}
# dotfiles {{{
for i in .ctags .inputrc .myclirc .tmux.conf .tmux.theme .doom.d .zshrc; do
    ensure_link "$SCRIPT_DIR/$i"
done
# }}}
# zshrc {{{
ZSHRC_SOURCE="$SCRIPT_DIR/.zshrc"
if [ -f "$HOME/.zshrc" ]; then
    # Existing .zshrc found (e.g. managed by ansible) - link as .zshrc.local
    if ! [ -L "$HOME/.zshrc.local" ]; then
        ln -sv "$ZSHRC_SOURCE" "$HOME/.zshrc.local"
    fi
    if ! grep -q 'source.*\.zshrc\.local' "$HOME/.zshrc"; then
        tmpfile=$(mktemp)
        printf '# Source personal config\nif [ -f ~/.zshrc.local ]; then\n    source ~/.zshrc.local\nfi\n\n' > "$tmpfile"
        cat "$HOME/.zshrc" >> "$tmpfile"
        mv "$tmpfile" "$HOME/.zshrc"
        echo "Injected source of .zshrc.local into .zshrc"
    fi
else
    ensure_link "$ZSHRC_SOURCE"
fi
# }}}
# tmux {{{
if ! [ -d ~/.tmux ]; then
    git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
fi
# }}}
# htop config {{{
HTOP_PATH=$HOME/.config/htop/
if ! [ -f $HTOP_PATH/htoprc -o -L $HTOP_PATH/htoprc ]; then
    mkdir -pv $HTOP_PATH
    ln -s $SCRIPT_DIR/htoprc $HTOP_PATH
else
    echo "Skipping htproc."
fi;
# }}}
# vim/nvim {{{
NVIM_VERSION="${NVIM_VERSION:-stable}"  # set NVIM_VERSION=nightly for dev builds
install_nvim() {
    mkdir -pv $HOME/.config/nvim/
    if [ $ON_A_MAC == "true" ]; then
        bash<<-EOF
        cd $(mktemp -d)
        curl -LO https://github.com/neovim/neovim/releases/download/${NVIM_VERSION}/nvim-macos-arm64.tar.gz
        tar xf nvim-macos-arm64.tar.gz
        rsync -avz ./nvim-macos-arm64/ ~/.local/
		EOF
    else
        bash<<-EOF
        cd $(mktemp -d)
        curl -LO https://github.com/neovim/neovim/releases/download/${NVIM_VERSION}/nvim-linux-x86_64.appimage
        chmod u+x nvim-linux-x86_64.appimage
        ./nvim-linux-x86_64.appimage --appimage-extract
        rsync -avz ./squashfs-root/usr/ ~/.local/
		EOF
    fi
}
if ! [ -x "$(command -v nvim)" ] || [ "$UPDATE_NVIM" == "true" ]; then
    install_nvim
else
    echo "Skipping nvim installation. Set UPDATE_NVIM=true to force update."
fi
if ! [ -e ~/.config/nvim/init.lua ]; then
    mkdir -p ~/.config/nvim
    ln -sv $SCRIPT_DIR/init.lua ~/.config/nvim
else
    echo "Skipping nvim config."
fi
# }}}
# terminal.app key mappings {{{
if [ $ON_A_MAC == "true" ]; then
    BUDDY=/usr/libexec/PlistBuddy
    TERM_PLIST="$HOME/Library/Preferences/com.apple.Terminal.plist"
    PROFILE="Clear Dark"
    if ! $BUDDY -c "Print 'Window Settings:$PROFILE:keyMapBoundKeys'" "$TERM_PLIST" &>/dev/null; then
        $BUDDY -c "Add 'Window Settings:$PROFILE:keyMapBoundKeys' dict" "$TERM_PLIST"
        while IFS=$'\t' read -r key val; do
            $BUDDY -c "Add 'Window Settings:$PROFILE:keyMapBoundKeys:${key}' string $(printf '%b' "$val")" "$TERM_PLIST"
        done < "$SCRIPT_DIR/terminal-keybindings.tsv"
    else
        echo "Skipping Terminal.app key mappings."
    fi
fi
# }}}
# pi config {{{
if [ -L "$HOME/.pi" ]; then
    echo "Skipping .pi config."
elif [ -d "$HOME/.pi" ]; then
    echo "WARNING: ~/.pi is a real directory. Back it up, remove it, then re-run deploy.sh"
else
    ln -sv "$SCRIPT_DIR/.pi" "$HOME/.pi"
fi
# }}}
# ai agent skills {{{
for skill_dir in $SCRIPT_DIR/skills/*/; do
    skill_name=$(basename "$skill_dir")
    for target in ~/.claude/skills ~/.agents/skills; do
        if [ -e "$target/$skill_name" ]; then
            echo "Skipping $target/$skill_name."
        else
            mkdir -p "$target"
            ln -sv "$skill_dir" "$target/$skill_name"
        fi
    done
done
# }}}
echo "Done."
