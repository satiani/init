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
    curl https://sh.rustup.rs -sSf | sh -s -- -y
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
        LINUX_ARCH=$(uname -m)
        if [ "$LINUX_ARCH" = "aarch64" ] || [ "$LINUX_ARCH" = "arm64" ]; then
            bash<<-EOF
            cd $(mktemp -d)
            curl -LO https://github.com/neovim/neovim/releases/download/${NVIM_VERSION}/nvim-linux-arm64.tar.gz
            tar xf nvim-linux-arm64.tar.gz
            rsync -avz ./nvim-linux-arm64/ ~/.local/
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
# ~/.pi must be a real directory so that runtime state (skills link-farm,
# sessions, auth, etc.) doesn't land inside the git repo.
# If it's a legacy whole-dir symlink, replace it with a real directory.
if [ -L "$HOME/.pi" ]; then
    echo "Migrating ~/.pi from legacy symlink to real directory..."
    rm "$HOME/.pi"
fi
mkdir -p "$HOME/.pi/agent"
# Selectively symlink tracked config items from the repo into ~/.pi
for item in extensions; do
    if [ ! -e "$HOME/.pi/$item" ]; then
        ln -sv "$SCRIPT_DIR/.pi/$item" "$HOME/.pi/$item"
    else
        echo "Skipping ~/.pi/$item"
    fi
done
for item in SYSTEM.md agents extensions mcp.json models.json prompts settings.json; do
    if [ ! -e "$HOME/.pi/agent/$item" ]; then
        ln -sv "$SCRIPT_DIR/.pi/agent/$item" "$HOME/.pi/agent/$item"
    else
        echo "Skipping ~/.pi/agent/$item"
    fi
done
# }}}
# ai agent skills {{{
for target in ~/.claude/skills ~/.agents/skills ~/.pi/agent/skills; do
    if [ -e "$target" ]; then
        echo "Skipping $target (already exists)."
    else
        mkdir -p "$(dirname "$target")"
        ln -sv "$SCRIPT_DIR/skills" "$target"
    fi
done
# }}}
echo "Done."
