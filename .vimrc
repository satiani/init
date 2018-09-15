" Vim config
" Samer Atiani - 2018
" Preamble {{{
" vim:foldmethod=marker
if &compatible
  set nocompatible               " Be iMproved
endif

" Required:
set runtimepath+=/home/satiani/.cache/dein/repos/github.com/Shougo/dein.vim
" }}}
" dein init {{{
" Required:
if dein#load_state('/home/satiani/.cache/dein')
  call dein#begin('/home/satiani/.cache/dein')

  " Let dein manage dein
  " Required:
  call dein#add('/home/satiani/.cache/dein/repos/github.com/Shougo/dein.vim')
  " }}}
" 3rd party plugins
  " Snippets {{{
  call dein#add('SirVer/ultisnips')
  call dein#add('honza/vim-snippets')
  " }}}
  " Syntax {{{
  call dein#add('isRuslan/vim-es6')
  call dein#add('ap/vim-css-color')
  call dein#add('lepture/vim-jinja')
  call dein#add('ElmCast/elm-vim')
  call dein#add('mklabs/vim-backbone')
  call dein#add('aaronj1335/underscore-templates.vim')
  " }}}
  " Navigation {{{
  call dein#add('junegunn/fzf', { 'build': './install' })
  call dein#add('junegunn/fzf.vim', { 'depends': 'junegunn/fzf' })
  call dein#add('easymotion/vim-easymotion')
  call dein#add('roblillack/vim-bufferlist')
  call dein#add('scrooloose/nerdtree')
  call dein#add('majutsushi/tagbar')
  " }}}
  " Text manipulation {{{
  call dein#add('junegunn/vim-easy-align')
  call dein#add('mattn/emmet-vim')
  call dein#add('maxbrunsfeld/vim-yankstack')
  call dein#add('tpope/vim-speeddating')
  " }}}
  " Code completion {{{
  call dein#add('Shougo/deoplete.nvim')
  if !has('nvim')
    call dein#add('roxma/nvim-yarp')
    call dein#add('roxma/vim-hug-neovim-rpc')
    call dein#add('Shougo/vimproc.vim', {'build' : 'make'})
  endif
  call dein#add('carlitux/deoplete-ternjs')
  call dein#add('autozimu/LanguageClient-neovim', {'build': 'bash install.sh'})
  " }}}
  " Version control {{{
  call dein#add('tpope/vim-fugitive')
  call dein#add('xuyuanp/nerdtree-git-plugin')
  " }}}
  " Styling {{{
  call dein#add('vim-airline/vim-airline')
  call dein#add('vim-airline/vim-airline-themes')
  call dein#add('flazz/vim-colorschemes')
  call dein#add('luochen1990/rainbow')
  " }}}
  " External integrations {{{
  call dein#add('w0rp/ale')
  call dein#add('benmills/vimux')
  call dein#add('pitluga/vimux-nose-test')
  call dein#add('tmux-plugins/vim-tmux-focus-events')
  call dein#add('roxma/vim-tmux-clipboard', { 'depends': 'tmux-plugins/vim-tmux-focus-events' })
  call dein#add('Shougo/vimshell.vim')
  " }}}
  " Enhanced Vim behavior {{{
  call dein#add('tpope/vim-eunuch')
  call dein#add('tpope/vim-unimpaired')
  call dein#add('tpope/vim-sleuth')
  call dein#add('tpope/vim-repeat')
  call dein#add('henrik/vim-indexed-search')
  call dein#add('tmhedberg/matchit')
  " }}}
  " Modes {{{
  call dein#add('jceb/vim-orgmode')
  " }}}
  " dein save state {{{
  " Required:
  call dein#end()
  call dein#save_state()
endif
" }}}
" dein install on startup? {{{
" if dein#check_install()
"   call dein#install()
" endif
" }}}
" User settings
" Vim options {{{
colorscheme zenburn
filetype plugin on
filetype indent off
syntax enable

set directory=$HOME/vimswap/
set undofile
set undodir=$HOME/vimswap/
set backspace=indent,eol,start
set completeopt=longest,menuone
set tw=120
set diffopt=vertical,filler
set expandtab
if executable("rg")
    set grepprg=rg\ --vimgrep\ --no-heading
    set grepformat=%f:%l:%c:%m,%f:%l:%m
endif
set autoindent
set hidden
set history=50
set ignorecase
set incsearch
set modeline
set showmatch		" Show matching brackets.
set smartcase
set suffixes=.bak,~,.swp,.o,.info,.aux,.log,.dvi,.bbl,.blg,.brf,.cb,.ind,.idx,.ilg,.inx,.out,.toc
set sts=4
set sw=4
set t_Co=256
set tags=tags;/
set wildmenu
set wildignore+=*/*.class,*/*.o,*/*.lo,*/*.pyc,*/*.pyo,uploads/*

"" Key mappings
let mapleader=","
let maplocalleader="\\"
map <F1> <nop>
map <Leader>q :botright cwindow<CR>
map <Leader>Q :botright lwindow<CR>
map <Leader>n :cnewer<CR>
map <Leader>p :colder<CR>
map <Leader>f :exec("gr " . expand("<cword>"))<CR>
" Replace word under cursor
map <Leader>s :%s/\<<C-r><C-w>\>/
map tk :tabfirst<CR>
map tl :tabnext<CR>
map th :tabprev<CR>
map tj :tablast<CR>
map tn :tabnew<CR>
" Click F10 to get the highlight group under cursor
" (http://vim.wikia.com/wiki/Identify_the_syntax_highlighting_group_used_at_the_cursor)
map <F10> :echo "hi<" . synIDattr(synID(line("."),col("."),1),"name") . '> trans<'
\ . synIDattr(synID(line("."),col("."),0),"name") . "> lo<"
\ . synIDattr(synIDtrans(synID(line("."),col("."),1)),"name") . ">"<CR>
" }}}
" Bufferlist {{{
map <silent> <F2> :call BufferList()<CR>
hi BufferSelected term=reverse ctermfg=black ctermbg=white cterm=NONE
hi BufferNormal term=NONE ctermfg=188 ctermbg=237 cterm=NONE
let g:BufferListMaxWidth = 60
" }}}
" Rainbow Parentheses {{{
let g:rainbow_active = 1
" }}}
" FZF {{{
nnoremap <C-p> :Files<CR>
nnoremap <C-l> :BTags<CR>
nnoremap <C-b> :Buffers<CR>
nnoremap <C-c> :History:<CR>
nnoremap <C-h> :Helptags<CR>
let $FZF_DEFAULT_OPTS = '--bind ctrl-d:page-down,ctrl-u:page-up'
let $FZF_DEFAULT_COMMAND = 'rg --files --follow --glob "!.git/*"'
let g:fzf_history_dir = '~/.local/share/fzf-history'
" }}}
" deoplete {{{
let g:deoplete#enable_at_startup = 1
" }}}
" Gitgutter {{{
set updatetime=100
nmap ]h <Plug>GitGutterNextHunk
nmap [h <Plug>GitGutterPrevHunk
" }}}
" Airline {{{
let g:airline_theme='lucius'
let g:airline_section_x=airline#section#create_right(['tagbar', ' ', 'filetype'])
let g:airline_section_y=airline#section#create_right([])
let g:airline_symbols.branch=''
let g:airline#extensions#fugitiveline#enabled = 0
" }}}
" ale {{{
let g:ale_fixers={
\    'python': ['isort', 'autopep8'],
\    'javascript': ['standard']
\}
let g:ale_linters={
\    'javascript': ['standard'],
\}
nmap <Leader>F <Plug>(ale_fix)
nmap <Leader>D <Plug>(ale_toggle_buffer)<CR>:GitGutterToggle<CR>
highlight ALEError ctermbg=140
" }}}
" Fugitive {{{
map <Leader>G :Gstatus<CR>
" }}}
" NERDTree {{{
function! SwitchToNerdTree(path)
    if exists("t:NERDTreeBufName")
        let winnr = bufwinnr(t:NERDTreeBufName)
        let currwinnr = bufwinnr("%")
        if winnr != -1 && winnr != currwinnr
            exec(winnr . "wincmd w")
            return
        elseif winnr != -1
            NERDTreeToggle
            return
        endif
    endif

    if a:path == ""
        NERDTreeToggle
    else
        exec("NERDTree " . a:path)
    endif
endfunction
let NERDTreeHijackNetrw = 0
let NERDTreeWinSize = 40
let NERDTreeIgnore = ['\.pyc$']
let NERDTreeQuitOnOpen = 1
map <silent><F3> :call SwitchToNerdTree("")<CR>
map <silent><F4> :call SwitchToNerdTree("%")<CR>
" }}}
" UtilSnips {{{
let g:UltiSnipsExpandTrigger="<tab>"
let g:UltiSnipsJumpForwardTrigger="<c-j>"
let g:UltiSnipsJumpBackwardTrigger="<c-k>"
let g:UltiSnipsEditSplit="vertical"
" }}}
" vim-easy-align {{{
xmap ga <Plug>(EasyAlign)
let g:easy_align_ignore_groups = []
" }}}
" Tagbar {{{
map <silent><F5>  :TagbarToggle<CR>
let g:tagbar_left = 1
let g:tagbar_autoclose = 1
" }}}
" vim-sleuth {{{
" Disables behavior by vim-sleuth where it will turn on filetype indent
let g:did_indent_on = 0
" }}}
" vimux {{{
function! VimuxIPython()
    call VimuxSendText(@v)
endfunction

au BufEnter *.py vmap <buffer> <Leader>vr "vy :call VimuxIPython()<CR>
map <Leader>vn :VimuxRunCommand("cd ~/code/web; ./npm_dev.sh")<CR>
map <Leader>vi :VimuxRunCommand("cd ~/code/web; source venv/bin/activate; python manage.py shell")<CR>
map <Leader>vl :VimuxRunCommand("tail -f /var/liwwa/log/**/*.log~**/*apache_access.log")<CR>
map <Leader>vp :VimuxPromptCommand<CR>
map <Leader>vc :VimuxCloseRunner<CR>
" }}}
" deoplete {{{
let g:deoplete#enable_at_startup = 1
" }}}
" deoplete-ternjs {{{
let g:deoplete#sources#ternjs#tern_bin = '~/code/web/app/static/node_modules/ternjs/bin/tern'
let g:deoplete#sources#ternjs#types = 1
let g:deoplete#sources#ternjs#depths = 1
" }}}
" LanguageServer {{{
let g:LanguageClient_serverCommands = {
    \ 'python': ['~/.langservers/python/venv/bin/pyls'],
    \ }
let g:LanguageClient_diagnosticsEnable = 0
map <Leader>d :call LanguageClient_textDocument_definition()<CR>
map <Leader>r :call LanguageClient#textDocument_rename()<CR>
map <Leader>t :call LanguageClient_textDocument_documentSymbol()<CR>
" }}}
" liwwa {{{
au BufWritePost *.py :silent !~/code/web/bin/compile_all.sh
au BufEnter ~/code/web/app/static/**/*.html :set syntax=underscore_template
au BufEnter *.html :silent RainbowToggleOff
" }}}
