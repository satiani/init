#!/usr/bin/env python3
"""Patch deploy.sh for container compatibility.

Two patches:
  1. Rust: make rustup non-interactive by appending -y flag
  2. Nvim: add ARM64 Linux download path alongside existing x86_64 appimage
"""
import sys


def patch_rust(lines):
    """Find the rustup install line and append -y for non-interactive mode."""
    for i, line in enumerate(lines):
        if "rustup.rs" in line and line.rstrip().endswith("sh"):
            lines[i] = line.rstrip() + " -s -- -y\n"
            print("  patched: rustup non-interactive")
            return lines
    print("  skipped: rustup already patched or changed upstream")
    return lines


def patch_nvim(lines):
    """Wrap the x86_64-only nvim block with architecture detection."""
    appimage_idx = None
    for i, line in enumerate(lines):
        if "nvim-linux-x86_64.appimage" in line and "curl" in line:
            appimage_idx = i
            break

    if appimage_idx is None:
        print("  skipped: nvim already patched or changed upstream")
        return lines

    else_idx = fi_idx = None
    for i in range(appimage_idx - 1, -1, -1):
        if lines[i].strip() == "else":
            else_idx = i
            break
    for i in range(appimage_idx + 1, len(lines)):
        if lines[i].strip() == "fi":
            fi_idx = i
            break

    if else_idx is None or fi_idx is None:
        print("  warning: could not find nvim block boundaries")
        return lines

    nvim_url = (
        "https://github.com/neovim/neovim/releases/download"
        "/${NVIM_VERSION}"
    )
    arm_block = [
        "    else\n",
        "        LINUX_ARCH=$(uname -m)\n",
        '        if [ "$LINUX_ARCH" = "aarch64" ] || '
        '[ "$LINUX_ARCH" = "arm64" ]; then\n',
        "            bash<<-EOF\n",
        "            cd $(mktemp -d)\n",
        "            curl -LO {}/nvim-linux-arm64.tar.gz\n".format(nvim_url),
        "            tar xf nvim-linux-arm64.tar.gz\n",
        "            rsync -avz ./nvim-linux-arm64/ ~/.local/\n",
        "\t\tEOF\n",
        "        else\n",
        "            bash<<-EOF\n",
        "            cd $(mktemp -d)\n",
        "            curl -LO {}/nvim-linux-x86_64.appimage\n".format(
            nvim_url
        ),
        "            chmod u+x nvim-linux-x86_64.appimage\n",
        "            ./nvim-linux-x86_64.appimage --appimage-extract\n",
        "            rsync -avz ./squashfs-root/usr/ ~/.local/\n",
        "\t\tEOF\n",
        "        fi\n",
        "    fi\n",
    ]
    lines[else_idx : fi_idx + 1] = arm_block
    print("  patched: nvim ARM64 support")
    return lines


def main():
    path = sys.argv[1]
    with open(path, "r") as f:
        lines = f.readlines()

    lines = patch_rust(lines)
    lines = patch_nvim(lines)

    with open(path, "w") as f:
        f.writelines(lines)


if __name__ == "__main__":
    main()
