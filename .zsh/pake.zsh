_pake_complete() {
    local a
    read -l a
    reply=(`pake -P|grep "$a"|cut -d " " -f2|sort|tr '\n' ' '`)
}
compctl -K _pake_complete pake
