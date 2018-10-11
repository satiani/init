" Vim config
" Samer Atiani - 2018
" Preamble {{{
" vim:foldmethod=marker:number
if &compatible
  set nocompatible               " Be iMproved
endif
" }}}

" Plugins {{{
call plug#begin('~/.local/share/nvim/plugged')
" Snippets {{{
Plug 'SirVer/ultisnips'
Plug 'honza/vim-snippets'
" }}}
" Syntax {{{
" javascript
Plug 'pangloss/vim-javascript'
Plug 'leafgarland/typescript-vim'
Plug 'mklabs/vim-backbone'
Plug 'aaronj1335/underscore-templates.vim'
Plug 'mxw/vim-jsx'
" css
Plug 'ap/vim-css-color'
" jinja
Plug 'lepture/vim-jinja'
" python
Plug 'Yggdroot/indentLine'
" }}}
" Navigation {{{
Plug '~/.fzf'
Plug 'junegunn/fzf.vim'
Plug 'easymotion/vim-easymotion'
Plug 'satiani/bufferlist.vim'
Plug 'scrooloose/nerdtree'
Plug 'majutsushi/tagbar'
Plug 'sjl/gundo.vim'
" }}}
" Text manipulation {{{
Plug 'junegunn/vim-easy-align'
Plug 'mattn/emmet-vim'
if has('nvim')
  Plug 'bfredl/nvim-miniyank'
endif
Plug 'tpope/vim-speeddating'
Plug 'terryma/vim-multiple-cursors'
" }}}
" Code completion {{{
Plug 'ternjs/tern_for_vim'
Plug 'mhartington/nvim-typescript'
Plug 'roxma/nvim-yarp'
if !has('nvim')
  Plug 'roxma/vim-hug-neovim-rpc'
endif
Plug 'autozimu/LanguageClient-neovim', {
\   'do': 'bash install.sh',
\   'branch': 'next',
\   'clone_opt': '--depth 1'
\}
Plug 'ncm2/ncm2'
Plug 'ncm2/ncm2-path'
Plug 'ncm2/ncm2-tern'
Plug 'ncm2/ncm2-ultisnips'
" dependency of ncm2-vim
Plug 'Shougo/neco-vim'
Plug 'ncm2/ncm2-vim'
Plug 'ncm2/ncm2-html-subscope'
" }}}
" Version control {{{
Plug 'tpope/vim-fugitive'
" }}}
" Styling {{{
Plug 'itchyny/lightline.vim'
Plug 'maximbaz/lightline-ale'
Plug 'flazz/vim-colorschemes'
Plug 'xolox/vim-misc'
Plug 'xolox/vim-colorscheme-switcher'
Plug 'luochen1990/rainbow'
Plug 'fenetikm/falcon', {'do': 'patch -p0 < ~/code/init/falcon.patch'}
" }}}
" External integrations {{{
Plug 'w0rp/ale'
Plug 'benmills/vimux'
Plug 'pitluga/vimux-nose-test'
if !has('nvim')
  Plug 'Shougo/vimshell.vim'
endif
" }}}
" Enhanced Vim behavior {{{
if has('nvim')
  Plug 'lambdalisue/suda.vim'
else
  Plug 'tpope/vim-eunuch'
endif
Plug 'tpope/vim-unimpaired'
Plug 'tpope/vim-sleuth'
Plug 'tpope/vim-repeat'
Plug 'henrik/vim-indexed-search'
Plug 'tmhedberg/matchit'
Plug 'junegunn/vim-peekaboo'
" }}}
" Modes {{{
Plug 'jceb/vim-orgmode'
" }}}
" Vim tools {{{
" }}}
call plug#end()
" }}}

" Vim options {{{
" General options {{{
set termguicolors
colorscheme falcon
filetype plugin on
filetype indent off
syntax enable
set directory=$HOME/vimswap/
set undofile
set undodir=$HOME/vimswap/
set backspace=indent,eol,start
set completeopt=noinsert,menuone,noselect
set tw=100
set diffopt=vertical,filler
set expandtab
if executable("rg")
  set grepprg=rg\ --vimgrep\ --no-heading
  set grepformat=%f:%l:%c:%m,%f:%l:%m
endif
set autoindent
set hidden
set history=1000
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
set noshowmode
" }}}
" Neovim Specific options {{{
if has('nvim')
  tnoremap <C-w> <C-\><C-N><C-w>
  augroup terminal
    au!
    " Temporarily prevent recording inside terminals until I develop the muscle memory
    " no to click q after selecting text (which is how I exit copy mode in tmux)
    au TermOpen * map <buffer> q <Nop>
    au BufEnter,FocusGained,BufEnter,BufWinEnter,WinEnter term://* map <buffer> q <Nop>
    au TermOpen * startinsert
    au TermClose term://* close
  augroup END
endif
" }}}
" Key mappings {{{
let mapleader=","
let maplocalleader="\\"
map <F1> <nop>
map <Leader>q :botright cwindow<CR>
map <Leader>Q :botright lwindow<CR>
map <Leader>n :cnewer<CR>
map <Leader>p :colder<CR>
map <Leader>f :exec("Rg " . expand("<cword>"))<CR>
map <Leader>o :belowright 10split +term<CR><C-\><C-n>:set wfh<CR>:set wfw<CR>i
" Replace word under cursor
map <Leader>s :%s/\<<C-r><C-w>\>/
map tk :tabfirst<CR>
map tl :tabnext<CR>
map th :tabprev<CR>
map tj :tablast<CR>
map tn :tabnew<CR>
map î <A-n>
" Click F10 to get the highlight group under cursor
" (http://vim.wikia.com/wiki/Identify_the_syntax_highlighting_group_used_at_the_cursor)
map <F10> :echo "hi<" . synIDattr(synID(line("."),col("."),1),"name") . '> trans<'
\ . synIDattr(synID(line("."),col("."),0),"name") . "> lo<"
\ . synIDattr(synIDtrans(synID(line("."),col("."),1)),"name") . ">"<CR>
" }}}
" autcmds {{{
augroup general_autocmds
  au!
  au FileType   javascript,python,sh,c,cpp,java,html,css,php,vim
\               au BufWrite * %s/\s\+$//e
augroup END
" }}}
" }}}
" vimplug{{{
map <F9> :source ~/.vimrc<CR>:PlugClean<CR>:PlugInstall<CR>
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
command! FZFMru call fzf#run({
\ 'source':  reverse(s:all_files()),
\ 'sink':    'edit',
\ 'options': '-m -x +s',
\ 'down':    '40%' })

function! s:all_files()
  return extend(
  \ reverse(filter(copy(v:oldfiles),
  \        "v:val !~ 'fugitive:\\|NERD_tree\\|^/tmp/\\|.git/\\|term:\\|_Gundo_'")),
  \ map(filter(range(1, bufnr('$')), 'buflisted(v:val)'), 'bufname(v:val)'))
endfunction
nnoremap <C-p> :Files<CR>
nnoremap <C-l> :BTags<CR>
nnoremap <C-b> :FZFMru<CR>
nnoremap <C-e> :History:<CR>
nnoremap <C-h> :Helptags<CR>
let $FZF_DEFAULT_OPTS = '--bind ctrl-d:page-down,ctrl-u:page-up'
let $FZF_DEFAULT_COMMAND = 'rg --hidden --files --follow --glob "!.git/*" 2>/dev/null'
let g:fzf_history_dir = '~/.local/share/fzf-history'
" }}}
" Lightline {{{
function! LightlineMode()
  return expand('%:t') ==# '__Tagbar__' ? 'Tagbar':
        \ &filetype ==# 'fzf' ? 'FZF' :
        \ lightline#mode()
endfunction

function! LightlineFilename()
  return &filetype ==# 'fzf' ? '' :
        \ expand('%:t') !=# '' ? expand('%:t') : '[No Name]'
endfunction

let g:lightline = {
      \ 'colorscheme': 'nord',
      \ 'active': {
      \     'right': [ [ 'linter_checking', 'linter_errors', 'linter_warnings', 'linter_ok' ],
      \                [ 'lineinfo' ],
      \                [ 'percent' ],
      \                [ 'tagbar', 'filetype', 'charvaluehex'] ]
      \ },
      \ 'component': {
      \     'charvaluehex': '0x%B',
      \     'tagbar': '%{tagbar#currenttag("%s", "", "f")}'
      \ },
      \ 'component_expand': {
      \     'linter_checking': 'lightline#ale#checking',
      \     'linter_warnings': 'lightline#ale#warnings',
      \     'linter_errors': 'lightline#ale#errors',
      \     'linter_ok': 'lightline#ale#ok',
      \ },
      \ 'component_type': {
      \     'linter_checking': 'left',
      \     'linter_warnings': 'warning',
      \     'linter_errors': 'error',
      \     'linter_ok': 'left',
      \ },
      \ 'component_function': {
      \     'mode': 'LightlineMode',
      \     'filename': 'LightlineFilename',
      \ },
      \ }
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
nmap <Leader>D <Plug>(ale_toggle_buffer)<CR>
highlight ALEError ctermbg=140
let g:ale_sign_error = '●' " Less aggressive than the default '>>'
let g:ale_sign_warning = '.'
" let g:ale_lint_on_enter = 0 " Less distracting when opening a new file
" let g:ale_python_mypy_options = '--py2 --silent-imports --fast-parser -i'
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
let NERDTreeIgnore = ['\.pyc$', '__pycache__']
let NERDTreeQuitOnOpen = 1
map <silent><F3> :call SwitchToNerdTree("")<CR>
map <silent><F4> :call SwitchToNerdTree("%")<CR>
" }}}
" UtilSnips {{{
let g:UltiSnipsExpandTrigger="<s-tab>"
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
let g:tagbar_ctags_bin = '/usr/bin/ctags'
" }}}
" vim-sleuth {{{
" Disables behavior by vim-sleuth where it will turn on filetype indent
let g:did_indent_on = 0
" }}}
" vimux/neovim terminal {{{
if has('nvim')
  map <Leader>vn :10split term://~/code/web/npm_dev.sh \| startinsert<CR>
  map <Leader>vi :20split term://zsh \| sleep 100m \| startinsert<CR>cd ~/code/web && source venv/bin/activate && python manage.py shell<CR><C-\><C-n>
  map <Leader>vl :10split term://zsh \| sleep 100m \| startinsert<CR>tail -f /var/liwwa/log/**/*.log~**/*apache_access.log<CR><C-\><C-n>
else
  function! VimuxIPython()
      call VimuxSendText(@v)
  endfunction
  augroup vimux_python
    au!
    au BufEnter *.py vmap <buffer> <Leader>vr "vy :call VimuxIPython()<CR>
  augroup END
  map <Leader>vn :VimuxRunCommand("cd ~/code/web; ./npm_dev.sh")<CR>
  map <Leader>vi :VimuxRunCommand("cd ~/code/web; source venv/bin/activate; python manage.py shell")<CR>
  map <Leader>vl :VimuxRunCommand("tail -f /var/liwwa/log/**/*.log~**/*apache_access.log")<CR>
  map <Leader>vp :VimuxPromptCommand<CR>
  map <Leader>vc :VimuxCloseRunner<CR>
endif
" }}}
" tern for vim {{{
let g:tern#command = [expand("~/.langservers/javascript/run.sh")]
let g:tern#arguments = ["--persistent"]
au FileType javascript map <buffer> <Leader>D :TernDef<CR>
au FileType javascript map <buffer> <Leader>d :TernDefPreview<CR>
au FileType javascript map <buffer> <Leader>r :TernRename<CR>

fun! s:setLightlineColorscheme(name)
    let g:lightline.colorscheme = a:name
    call lightline#init()
    call lightline#colorscheme()
    call lightline#update()
endfun

fun! s:lightlineColorschemes(...)
    return join(map(
                \ globpath(&rtp,"autoload/lightline/colorscheme/*.vim",1,1),
                \ "fnamemodify(v:val,':t:r')"),
                \ "\n")
endfun

com! -nargs=1 -complete=custom,s:lightlineColorschemes LightlineColorscheme
            \ call s:setLightlineColorscheme(<q-args>)
" }}}
" ncm2 {{{
autocmd BufEnter  *  call ncm2#enable_for_buffer()
inoremap <silent><expr> <TAB> pumvisible() ? "\<C-n>" : "\<TAB>"
inoremap <silent><expr> <c-d> pumvisible() ? "\<PageDown>" : "\<c-d>"
inoremap <silent><expr> <c-u> pumvisible() ? "\<PageUp>" : "\<c-u>"
inoremap <expr> <CR> (pumvisible() ? "\<c-y>\<cr>" : "\<CR>")
" add tern to runtimepath so it gets caught by ncm2_tern
let &runtimepath.=','.escape(expand('~/.langservers/javascript/'), '\,')
" }}}
" LanguageServer {{{
let g:LanguageClient_serverCommands = {
    \ 'python': ['~/.langservers/python/run.sh', '~/code/web/venv/'],
    \ 'typescript': ['~/.langservers/typescript/tsserver/lib/language-server-stdio.js'],
    \ }
let g:LanguageClient_diagnosticsEnable = 0
let g:LanguageClient_loggingFile = '/tmp/lc.log'
let g:LanguageClient_loggingLevel = 'DEBUG'
augroup language_client
  au!
  au FileType python,typescript map <buffer> <Leader>d :call LanguageClient#textDocument_definition({'gotoCmd': 'split'})<CR>
  au FileType python,typescript map <buffer> <Leader>D :call LanguageClient_textDocument_definition()<CR>
  au FileType python,typescript map <buffer> <Leader>r :call LanguageClient#textDocument_rename()<CR>
  au FileType python,typescript map <buffer> <Leader>t :call LanguageClient_textDocument_documentSymbol()<CR>
  au FileType python,typescript map <buffer> K :call LanguageClient_textDocument_hover()<CR>
  au User LanguageClientStarted command References call LanguageClient#textDocument_references()
  au User LanguageClientStopped delcommand References
augroup END
" }}}
" miniyank {{{
map p <Plug>(miniyank-autoput)
map P <Plug>(miniyank-autoPut)
map <localleader>[ <Plug>(miniyank-cycle)
" }}}
" gundo {{{
map <Leader>u :GundoShow<CR>
" }}}
" indentLine {{{
let g:indentLine_fileType = ['python']
" }}}
" liwwa {{{
augroup liwwa
  au!
  au BufWritePost *.py :silent !~/code/web/bin/compile_all.sh
  au BufEnter ~/code/web/app/static/**/*.html :set syntax=underscore_template
  au BufEnter *.html :silent RainbowToggleOff
augroup END
let g:python_host_prog  = expand('~/.local/share/nvim/python2/venv/bin/python')
let g:python3_host_prog  =  expand('~/.local/share/nvim/python3/venv/bin/python3.6')
" }}}
