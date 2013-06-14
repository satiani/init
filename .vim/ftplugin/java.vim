setlocal statusline=%<%f\ %h%m%r%=%-14.(%l,%c%V%)\ %-35.35(%{Tlist_Get_Tagname_By_Line()}%)\ %P
au BufWritePost,BufRead <buffer> TlistUpdate
" The reason we need to have an extra call here to TlistUpdate is that a
" BufRead event is not setup for a php file before this plugin is called
TlistUpdate
setlocal sw=2
setlocal sts=2
