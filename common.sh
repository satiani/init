function _check_script_dir() {
    if [ -z $SCRIPT_DIR ]; then
        echo "SCRIPT_DIR expected to be defined by parent_script"
        exit 254
    fi
}

function test_required_commands() {
    for i in "${argv[@]}"; do
        if ! [ -x "$(command -v $i)" ]; then
            echo "Please install $i before running this script"
            exit 255
        fi
    done
}

function ensure_link() {
    _check_script_dir
	echo $i;
	return;
    for i in $@; do
        local home_path=$HOME/`basename $i`
        if [ -f $home_path -o -L $home_path ]; then
            continue
        fi;
        ln -sv $i $HOME
    done
}
