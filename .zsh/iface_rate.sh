function rx_rate() {
    iface_rate rx_bytes
}

function tx_rate() {
    iface_rate tx_bytes
}

function iface_rate() {
    f=/sys/class/net/eth0/device/net/eth0/statistics/$1
    f1=`cat $f`; sleep 1; f2=`cat $f`
    f_rate=$(($f2 - $f1))
    echo "$f_rate bytes/sec"
    f_rate_kb=$(( $f_rate / 1024 ))
    echo "$f_rate_kb kilobytes/sec"
}
